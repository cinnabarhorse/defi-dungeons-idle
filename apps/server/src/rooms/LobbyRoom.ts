import { Room, Client, matchMaker } from 'colyseus';
import { Schema, type, MapSchema } from '@colyseus/schema';
import { GAME_CONFIG } from '../lib/constants';
import {
  ensureServerBroadcaster,
  type ServerBroadcaster,
} from '../lib/messaging';
import type { RoomListing as LobbyRoomListing } from '../types/messages';

export class RoomListingSchema extends Schema {
  @type('string') id: string = '';
  @type('string') name: string = '';
  @type('number') playerCount: number = 0;
  @type('number') maxPlayers: number = 0;
  @type('string') region: string = '';
  @type('boolean') isPrivate: boolean = false;
  @type('string') metadata: string = '{}'; // JSON string
}

export class LobbyState extends Schema {
  @type({ map: RoomListingSchema }) rooms = new MapSchema<RoomListingSchema>();
}

export class LobbyRoom extends Room<LobbyState> {
  public msg!: ServerBroadcaster;
  private updateInterval!: NodeJS.Timeout;

  onCreate() {
    console.log('LobbyRoom created');
    this.setState(new LobbyState());
    this.msg = ensureServerBroadcaster(this);

    // Update room listings every 5 seconds
    this.updateInterval = setInterval(() => {
      this.updateRoomListings();
    }, 5000);

    this.setupMessageHandlers();
  }

  onJoin(client: Client) {
    console.log(`Client ${client.sessionId} joined lobby`);

    // Send current room listings
    this.msg.sendTo(client, 'room_listings', this.getRoomListingsArray());
  }

  onLeave(client: Client) {
    console.log(`Client ${client.sessionId} left lobby`);
  }

  onDispose() {
    console.log('LobbyRoom disposed');
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }

  private setupMessageHandlers() {
    this.onMessage(
      'create_room',
      async (
        client,
        options: {
          name?: string;
          isPrivate?: boolean;
          maxPlayers?: number;
          region?: string;
        }
      ) => {
        try {
          const requestedMax = Number(options.maxPlayers);
          const maxPlayers = Number.isFinite(requestedMax)
            ? Math.max(
                1,
                Math.min(GAME_CONFIG.MAX_PLAYERS, Math.floor(requestedMax))
              )
            : GAME_CONFIG.MAX_PLAYERS;

          const roomOptions = {
            region: options.region || 'us-east',
            isPrivate: options.isPrivate || false,
            maxPlayers,
            roomCode: options.isPrivate ? this.generateRoomCode() : undefined,
          };

          const room = await matchMaker.createRoom('game_room', roomOptions);

          this.msg.sendTo(client, 'room_created', {
            roomId: room.roomId,
            roomCode: roomOptions.roomCode,
          });

          // Join the created room
          const reservation = await matchMaker.joinById(room.roomId, {
            name: options.name || `Player_${client.sessionId.slice(0, 6)}`,
          });

          this.msg.sendTo(client, 'join_room', {
            reservation,
          });
        } catch (error) {
          console.error('Failed to create room:', error);
          this.msg.sendTo(client, 'room_creation_failed', {
            error: 'Failed to create room',
          });
        }
      }
    );

    this.onMessage(
      'join_room',
      async (
        client,
        data: {
          roomId?: string;
          roomCode?: string;
          playerName?: string;
        }
      ) => {
        try {
          let reservation;

          if (data.roomCode) {
            // Join by room code (private room)
            const rooms = await matchMaker.query({
              name: 'game_room',
              private: true,
            });

            const targetRoom = rooms.find(
              (room) => room.metadata?.roomCode === data.roomCode
            );

            if (!targetRoom) {
              this.msg.sendTo(client, 'join_room_failed', {
                error: 'Room code not found',
              });
              return;
            }

            reservation = await matchMaker.joinById(targetRoom.roomId, {
              name: data.playerName || `Player_${client.sessionId.slice(0, 6)}`,
            });
          } else if (data.roomId) {
            // Join by room ID
            reservation = await matchMaker.joinById(data.roomId, {
              name: data.playerName || `Player_${client.sessionId.slice(0, 6)}`,
            });
          } else {
            // Quick join - find any available public room
            reservation = await matchMaker.joinOrCreate('game_room', {
              name: data.playerName || `Player_${client.sessionId.slice(0, 6)}`,
              region: 'us-east', // TODO: Determine user's region
              isPrivate: false,
            });
          }

          this.msg.sendTo(client, 'join_room', {
            reservation,
          });
        } catch (error) {
          console.error('Failed to join room:', error);
          this.msg.sendTo(client, 'join_room_failed', {
            error: 'Failed to join room',
          });
        }
      }
    );

    this.onMessage('get_room_listings', (client) => {
      this.msg.sendTo(client, 'room_listings', this.getRoomListingsArray());
    });
  }

  private async updateRoomListings() {
    try {
      // Query all public game rooms
      const rooms = await matchMaker.query({
        name: 'game_room',
        private: false,
      });

      // Clear current listings
      this.state.rooms.clear();

      // Add current rooms
      rooms.forEach((room) => {
        const listing = new RoomListingSchema();
        listing.id = room.roomId;
        listing.name = room.metadata?.name || `Room ${room.roomId.slice(0, 6)}`;
        listing.playerCount = room.clients;
        listing.maxPlayers = room.maxClients;
        listing.region = room.metadata?.region || 'unknown';
        listing.isPrivate = room.private || false;
        listing.metadata = JSON.stringify(room.metadata || {});

        this.state.rooms.set(room.roomId, listing);
      });

      // Broadcast updated listings to all clients
      this.msg.broadcast('room_listings_updated', this.getRoomListingsArray());
    } catch (error) {
      console.error('Failed to update room listings:', error);
    }
  }

  private getRoomListingsArray(): LobbyRoomListing[] {
    const listings: LobbyRoomListing[] = [];
    this.state.rooms.forEach((room) => {
      let metadata: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(room.metadata);
        if (parsed && typeof parsed === 'object') {
          metadata = parsed as Record<string, unknown>;
        }
      } catch {
        metadata = {};
      }
      listings.push({
        id: room.id,
        name: room.name,
        playerCount: room.playerCount,
        maxPlayers: room.maxPlayers,
        region: room.region,
        isPrivate: room.isPrivate,
        metadata,
      });
    });
    return listings;
  }

  private generateRoomCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }
}
