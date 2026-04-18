import { PlayerState, ShipState, PlayerAction, ActionResult } from './types';
import { clampShip } from './shipUpdate';

export interface ResolveResult {
  ship: ShipState;
  players: PlayerState[];
  results: ActionResult[];
}

export function resolveActions(
  ship: ShipState,
  players: PlayerState[]
): ResolveResult {
  let updatedShip = { ...ship };
  const updatedPlayers = players.map(p => ({ ...p }));
  const results: ActionResult[] = [];

  // Process actions for all alive players who submitted
  for (const player of updatedPlayers) {
    if (!player.alive || !player.currentAction) continue;

    const action = player.currentAction;
    let description = '';

    switch (action.type) {
      case 'gather': {
        const resource = action.resource ?? 'oxygen';
        (updatedShip as Record<string, number>)[resource] = Math.min(
          resource === 'repair_parts' ? 50 : 100,
          (updatedShip as Record<string, number>)[resource] + 8
        );
        description = `${player.name} gathered +8 ${resource}.`;
        break;
      }

      case 'repair': {
        if (updatedShip.repair_parts >= 4) {
          updatedShip.hull_integrity = Math.min(100, updatedShip.hull_integrity + 12);
          updatedShip.repair_parts = Math.max(0, updatedShip.repair_parts - 4);
          description = `${player.name} repaired the hull (+12 integrity, -4 parts).`;
        } else {
          description = `${player.name} tried to repair but not enough parts.`;
        }
        break;
      }

      case 'hoard': {
        const amount = Math.min(10, updatedShip.oxygen);
        updatedShip.oxygen = Math.max(0, updatedShip.oxygen - amount);
        player.personal_oxygen = Math.min(100, player.personal_oxygen + amount);
        description = `${player.name} hoarded ${amount} oxygen.`;
        break;
      }

      case 'share': {
        const amount = Math.min(10, player.personal_oxygen);
        player.personal_oxygen = Math.max(0, player.personal_oxygen - amount);
        updatedShip.oxygen = Math.min(100, updatedShip.oxygen + amount);
        description = `${player.name} shared ${amount} oxygen back to the ship.`;
        break;
      }

      case 'sabotage': {
        const targetPlayer = updatedPlayers.find(p => p.id === action.target && p.alive);
        const resource = action.resource ?? 'oxygen';
        if (targetPlayer) {
          targetPlayer.health = Math.max(0, targetPlayer.health - 15);
          if (targetPlayer.health === 0) targetPlayer.alive = false;
        }
        (updatedShip as Record<string, number>)[resource] = Math.max(
          0,
          (updatedShip as Record<string, number>)[resource] - 8
        );
        description = `${player.name} sabotaged ${targetPlayer?.name ?? 'unknown'} (-15 health, -8 ${resource}).`;
        break;
      }

      case 'sacrifice': {
        player.health = 0;
        player.alive = false;
        updatedShip.hull_integrity = Math.min(100, updatedShip.hull_integrity + 25);
        updatedShip.oxygen = Math.min(100, updatedShip.oxygen + 20);
        description = `${player.name} sacrificed themselves! (+25 hull, +20 oxygen).`;
        break;
      }
    }

    results.push({
      playerId: player.id,
      playerName: player.name,
      action,
      description,
    });
  }

  return {
    ship: clampShip(updatedShip),
    players: updatedPlayers,
    results,
  };
}
