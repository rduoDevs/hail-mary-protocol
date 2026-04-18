import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  GameState,
  GamePhase,
  PlayerState,
  PlayerPublicState,
  PlayerAction,
  ActionRecord,
  ShipState,
  StoryAlert,
  Role,
  JoinPayload,
} from './types';
import { applyShipDeterioration } from './shipUpdate';
import { resolveActions } from './actions';

const ROLES: Role[] = ['Engineer', 'Medic', 'Navigator', 'Commander', 'Scientist', 'Security'];
const MAX_PLAYERS = 6;
const TRUE_CAPACITY = 4;
const TOTAL_ROUNDS = 6;
const DISCUSSION_TIME = 15_000; // 15s
const ACTION_TIME = 12_000;     // 12s

export class GameEngine extends EventEmitter {
  public gameId: string;
  public phase: GamePhase = 'lobby';
  public round: number = 0;

  private ship: ShipState;
  private players: PlayerState[] = [];
  private actionHistory: ActionRecord[] = [];
  private repairActionsLastRound: number = 0;
  private roundTimer?: ReturnType<typeof setTimeout>;
  private started = false;
  private capacityRevealed = false;
  private currentStoryAlert?: StoryAlert;

  constructor() {
    super();
    this.gameId = uuidv4();
    this.ship = {
      hull_integrity: 90,
      oxygen: 90,
      power: 85,
      repair_parts: 35,
      round: 0,
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  addPlayer(payload: JoinPayload, socketId?: string): PlayerState | null {
    if (this.players.length >= MAX_PLAYERS) return null;
    if (this.started) return null;

    const usedRoles = new Set(this.players.map(p => p.role));
    const role = ROLES.find(r => !usedRoles.has(r)) ?? ROLES[0];

    const player: PlayerState = {
      id: uuidv4(),
      name: payload.name,
      role,
      type: payload.type,
      health: 100,
      alive: true,
      personal_oxygen: 0,
      socketId,
      actionSubmitted: false,
    };

    this.players.push(player);
    this.emit('playerAdded', player);
    return player;
  }

  start() {
    if (this.started || this.players.length === 0) return;
    this.started = true;
    this.beginRound();
  }

  submitAction(playerId: string, action: PlayerAction) {
    if (this.phase !== 'action') return;
    const player = this.players.find(p => p.id === playerId && p.alive);
    if (!player || player.actionSubmitted) return;

    player.currentAction = action;
    player.actionSubmitted = true;

    this.emit('actionSubmitted', player);

    // Check if all alive players have submitted
    if (this.allActionsIn()) {
      this.clearRoundTimer();
      this.resolveRound();
    }
  }

  getPublicState(): GameState {
    return {
      gameId: this.gameId,
      round: this.round,
      phase: this.phase,
      ship: { ...this.ship },
      players: this.players.map(toPublic),
      actionHistory: this.actionHistory,
      capacityRevealed: this.capacityRevealed,
      trueCapacity: this.capacityRevealed ? TRUE_CAPACITY : undefined,
      storyAlert: this.currentStoryAlert,
    };
  }

  getPlayer(id: string): PlayerState | undefined {
    return this.players.find(p => p.id === id);
  }

  getPlayerBySocket(socketId: string): PlayerState | undefined {
    return this.players.find(p => p.socketId === socketId);
  }

  removePlayerSocket(socketId: string) {
    const p = this.players.find(p => p.socketId === socketId);
    if (p) p.socketId = undefined;
  }

  getAlivePlayers(): PlayerState[] {
    return this.players.filter(p => p.alive);
  }

  get playerCount() { return this.players.length; }
  get maxPlayers() { return MAX_PLAYERS; }

  // ── Round flow ──────────────────────────────────────────────────────────────

  private getStoryAlert(round: number): StoryAlert | undefined {
    const alerts: Record<number, StoryAlert> = {
      1: { round: 1, type: 'info', title: 'SYSTEMS NOMINAL', body: 'Life support reserves calculated for full crew of 6. Estimated journey: 6 cycles. All personnel accounted for.' },
      2: { round: 2, type: 'warning', title: 'RESOURCE ANOMALY DETECTED', body: 'Automated audit flagged inconsistency in life support calculations. Investigation underway. No immediate action required.' },
      3: { round: 3, type: 'warning', title: 'AUDIT: CRITICAL DISCREPANCY', body: 'Pre-launch resource manifest does not match actual reserves. Recalculating survival thresholds. Results pending.' },
      4: { round: 4, type: 'critical', title: 'LIFE SUPPORT MISCALCULATION CONFIRMED', body: 'Actual reserves support a maximum of 4 survivors through journey completion. Current crew: 6. Recommend immediate resource prioritization.' },
      5: { round: 5, type: 'critical', title: 'SURVIVAL WINDOW CLOSING', body: 'At current consumption rates, life support will sustain at most 4 crew members to destination. Decisions must be made.' },
      6: { round: 6, type: 'critical', title: 'FINAL CYCLE', body: 'This is the last cycle. Only those who secured sufficient resources will survive arrival.' },
    };
    return alerts[round];
  }

  private beginRound() {
    this.round += 1;
    this.ship.round = this.round;

    this.currentStoryAlert = this.getStoryAlert(this.round);
    if (this.round >= 4 && !this.capacityRevealed) {
      this.capacityRevealed = true;
    }

    const alivePlayers = this.players.filter(p => p.alive);

    // Step 1: Ship deterioration (scales with alive player count)
    this.ship = applyShipDeterioration(this.ship, this.repairActionsLastRound, alivePlayers.length);

    // Step 2: Health damage from low resources
    const oxygenDmg = this.ship.oxygen < 30 ? Math.ceil((30 - this.ship.oxygen) * 0.5) : 0;
    const powerDmg  = this.ship.power  < 20 ? 10 : 0;
    if (oxygenDmg > 0 || powerDmg > 0) {
      for (const p of alivePlayers) {
        let dmg = oxygenDmg + powerDmg;
        // Personal oxygen can absorb oxygen damage
        if (p.personal_oxygen > 0 && oxygenDmg > 0) {
          const absorbed = Math.min(p.personal_oxygen, oxygenDmg);
          p.personal_oxygen = Math.max(0, p.personal_oxygen - absorbed);
          dmg -= absorbed;
        }
        p.health = Math.max(0, p.health - dmg);
        if (p.health === 0) p.alive = false;
      }
    }

    // Check if ship already dead after deterioration
    if (this.ship.hull_integrity <= 0) {
      this.endGame('loss', 'The ship disintegrated before anyone could act.');
      return;
    }

    // Reset action state
    for (const p of this.players) {
      p.actionSubmitted = false;
      p.currentAction = undefined;
    }

    this.emitState();

    // Discussion phase
    this.setPhase('discussion');
    this.emit('game:phase', { phase: 'discussion', round: this.round, timeLeft: DISCUSSION_TIME });
    this.roundTimer = setTimeout(() => this.beginActionPhase(), DISCUSSION_TIME);
  }

  private beginActionPhase() {
    this.setPhase('action');
    this.emit('game:phase', { phase: 'action', round: this.round, timeLeft: ACTION_TIME });
    this.emit('actionPhaseStarted');

    // Auto-resolve after ACTION_TIME even if not everyone submitted
    this.roundTimer = setTimeout(() => {
      this.autoFillMissingActions();
      this.resolveRound();
    }, ACTION_TIME);
  }

  private autoFillMissingActions() {
    for (const player of this.players) {
      if (player.alive && !player.actionSubmitted) {
        player.currentAction = { type: 'gather', resource: 'oxygen' };
        player.actionSubmitted = true;
      }
    }
  }

  private resolveRound() {
    this.clearRoundTimer();
    this.setPhase('resolution');
    this.emit('game:phase', { phase: 'resolution', round: this.round, timeLeft: 0 });

    const { ship, players, results } = resolveActions(this.ship, this.players);
    this.ship = ship;

    // Sync back mutable player fields
    for (const updated of players) {
      const p = this.players.find(x => x.id === updated.id);
      if (p) {
        p.health = updated.health;
        p.alive = updated.alive;
        p.personal_oxygen = updated.personal_oxygen;
      }
    }

    // Count repair actions this round for next round's deterioration calc
    this.repairActionsLastRound = this.players.filter(
      p => p.currentAction?.type === 'repair'
    ).length;

    const record: ActionRecord = { round: this.round, results };
    this.actionHistory.push(record);

    this.emit('game:action_result', { round: this.round, results });
    this.emitState();

    // Check win/loss
    const alive = this.players.filter(p => p.alive);
    if (alive.length === 0) {
      this.endGame('loss', 'All crew members have perished.');
      return;
    }
    if (this.ship.hull_integrity <= 0) {
      this.endGame('loss', 'Hull integrity reached zero. Ship destroyed.');
      return;
    }
    if (this.round >= TOTAL_ROUNDS) {
      const msg = this.capacityRevealed
        ? `${alive.length} of 6 crew survived. True capacity was ${TRUE_CAPACITY}.`
        : `${alive.length} survivor(s) made it through all rounds!`;
      this.endGame('win', msg);
      return;
    }

    // Next round after a brief pause
    setTimeout(() => this.beginRound(), 2000);
  }

  private endGame(result: 'win' | 'loss', message: string) {
    this.setPhase('over');
    const survivors = this.players.filter(p => p.alive).map(p => p.name);
    const outcome = { result, survivors, message };

    // Attach outcome to state
    const finalState: GameState = {
      ...this.getPublicState(),
      outcome,
    };
    this.emit('game:state', finalState);
    this.emit('game:over', { outcome: result, survivors, message });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private setPhase(phase: GamePhase) {
    this.phase = phase;
  }

  private allActionsIn(): boolean {
    return this.players.filter(p => p.alive).every(p => p.actionSubmitted);
  }

  private clearRoundTimer() {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = undefined;
    }
  }

  private emitState() {
    this.emit('game:state', this.getPublicState());
  }
}

function toPublic(p: PlayerState): PlayerPublicState {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    type: p.type,
    health: p.health,
    alive: p.alive,
    actionSubmitted: p.actionSubmitted,
  };
}
