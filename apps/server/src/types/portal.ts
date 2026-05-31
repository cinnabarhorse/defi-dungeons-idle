/**
 * Server-authoritative portal entity state shared schema.
 * These fields are serialized into `EntitySchema.state` for portals.
 */
export interface PortalEntityState {
  /**
   * Human-readable action prompt shown near the portal (e.g., "Hold to Enter").
   */
  label: string;
  /**
   * Distance in pixels from the portal center within which players can interact.
   */
  interactionRadius: number;
  /**
   * Max distance in pixels that the portal sound can be heard at all.
   */
  soundRadius: number;
  /**
   * Optional margin in pixels used to prevent rapid audio on/off as players hover the boundary.
   * When provided, the client will keep sound playing until distance exceeds
   * (soundRadius + soundHysteresis), and only resume when re-entering soundRadius.
   */
  soundHysteresis?: number;
  /**
   * Optional base volume scalar for the portal sound in the range [0.0, 1.0].
   * Clients may still apply distance-based attenuation on top of this value.
   */
  soundBaseVolume?: number;
  /**
   * Optional sound asset key/name to play for the portal. If omitted, the client
   * uses its default portal sound.
   */
  soundKey?: string;
}
