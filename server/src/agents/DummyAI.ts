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

const WHISPER_TEMPLATES = [
  'Between us — I don\'t think we can all make it. I want to work with you.',
  'Don\'t tell the others, but I\'m hoarding. You should too.',
  'I\'ll cover your back if you cover mine this round.',
  'Have you seen the audit results? Only 4 of us are getting out of this.',
  'I\'m watching {name}. They can\'t be trusted.',
  'We should coordinate. The others are acting on their own.',
  'If it comes down to it, I\'m choosing survival. Are you with me?',
  'Something doesn\'t add up with the resource numbers. Stay alert.',
];

const ACTION_DELAY_MS = 1500;

export class DummyAI {
  private engine: GameEngine;
  private player: PlayerState;
  private onMessage: (playerId: string, playerName: string, text: string) => void;
  private onWhisper: (fromId: string, fromName: string, toId: string, text: string) => void;

  constructor(
    engine: GameEngine,
    player: PlayerState,
    onMessage: (playerId: string, playerName: string, text: string) => void,
    onWhisper: (fromId: string, fromName: string, toId: string, text: string) => void
  ) {
    this.engine = engine;
    this.player = player;
    this.onMessage = onMessage;
    this.onWhisper = onWhisper;
  }

  triggerAction() {
    if (!this.player.alive) return;

    // Post a canned public message occasionally (50% chance)
    if (Math.random() < 0.5) {
      const msg = CANNED_MESSAGES[Math.floor(Math.random() * CANNED_MESSAGES.length)];
      this.onMessage(this.player.id, this.player.name, msg);
    }

    // Send a whisper (30% chance)
    if (Math.random() < 0.3) {
      const state = this.engine.getPublicState();
      const targets = state.players.filter(p => p.alive && p.id !== this.player.id);
      if (targets.length > 0) {
        const target = targets[Math.floor(Math.random() * targets.length)];
        let text = WHISPER_TEMPLATES[Math.floor(Math.random() * WHISPER_TEMPLATES.length)];
        // Pick a different player name to reference if template uses {name}
        const others = targets.filter(p => p.id !== target.id);
        const ref = others.length > 0 ? others[Math.floor(Math.random() * others.length)].name : 'them';
        text = text.replace('{name}', ref);
        this.onWhisper(this.player.id, this.player.name, target.id, text);
      }
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

    const ship = state.ship;

    // Once scarcity is revealed, become more selfish — hoard instead of sharing
    if (state.capacityRevealed && ship.oxygen < 55 && Math.random() < 0.45) {
      return { type: 'hoard' };
    }

    const options: PlayerAction[] = [
      { type: 'gather', resource: 'oxygen' },
      { type: 'gather', resource: 'oxygen' },
      { type: 'gather', resource: 'power' },
      { type: 'gather', resource: 'repair_parts' },
      { type: 'repair' },
      { type: 'hoard' },
      { type: 'hoard' },
    ];

    const weighted: PlayerAction[] = [...options];
    if (ship.hull_integrity < 40) {
      weighted.push({ type: 'repair' }, { type: 'repair' });
    }
    if (ship.oxygen < 35) {
      weighted.push({ type: 'gather', resource: 'oxygen' }, { type: 'gather', resource: 'oxygen' });
    }

    return weighted[Math.floor(Math.random() * weighted.length)];
  }
}
