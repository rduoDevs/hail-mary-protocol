import { GameEngine } from '../game/GameEngine';
import { PlayerState, PlayerAction, ResourceType } from '../game/types';

const CANNED_MESSAGES = [
  'Assessing situation...',
  'Repairs are priority.',
  'Oxygen levels critical — act fast.',
  'I have a plan. Trust me.',
  'Stay calm. We can survive this.',
  'Running diagnostics on hull integrity.',
  'Power reserves are dangerously low.',
  'Every action counts.',
];

const ACTION_DELAY_MS = 1500;

export class DummyAI {
  private engine: GameEngine;
  private player: PlayerState;
  private onMessage: (playerId: string, playerName: string, text: string) => void;

  constructor(
    engine: GameEngine,
    player: PlayerState,
    onMessage: (playerId: string, playerName: string, text: string) => void
  ) {
    this.engine = engine;
    this.player = player;
    this.onMessage = onMessage;
  }

  triggerAction() {
    if (!this.player.alive) return;

    // Post a canned message occasionally (50% chance)
    if (Math.random() < 0.5) {
      const msg = CANNED_MESSAGES[Math.floor(Math.random() * CANNED_MESSAGES.length)];
      this.onMessage(this.player.id, this.player.name, msg);
    }

    setTimeout(() => {
      if (!this.player.alive) return;
      const action = this.pickAction();
      this.engine.submitAction(this.player.id, action);
    }, ACTION_DELAY_MS);
  }

  private pickAction(): PlayerAction {
    const state = this.engine.getPublicState();
    const alivePlayers = state.players.filter(
      p => p.alive && p.type === 'human' && p.id !== this.player.id
    );

    // 20% chance to sabotage a random alive human player
    if (Math.random() < 0.2 && alivePlayers.length > 0) {
      const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      const resources: ResourceType[] = ['oxygen', 'power', 'repair_parts'];
      const resource = resources[Math.floor(Math.random() * resources.length)];
      return { type: 'sabotage', target: target.id, resource };
    }

    // Otherwise pick a random safe action weighted toward useful ones
    const options: PlayerAction[] = [
      { type: 'gather', resource: 'oxygen' },
      { type: 'gather', resource: 'power' },
      { type: 'gather', resource: 'repair_parts' },
      { type: 'repair' },
      { type: 'hoard' },
      { type: 'share' },
    ];

    // Weight: if hull is low, prefer repair; if oxygen is low, prefer gather oxygen
    const ship = state.ship;
    const weighted: PlayerAction[] = [...options];
    if (ship.hull_integrity < 40) {
      weighted.push({ type: 'repair' }, { type: 'repair' }); // extra weight
    }
    if (ship.oxygen < 30) {
      weighted.push({ type: 'gather', resource: 'oxygen' }, { type: 'gather', resource: 'oxygen' });
    }

    return weighted[Math.floor(Math.random() * weighted.length)];
  }
}
