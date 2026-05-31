export interface MinimapOptions {
  /** Desktop viewport size in pixels (width == height). */
  size: number;
  /** Mobile viewport size in pixels (width == height). */
  mobileSize: number;
  /** Optional padding from screen edges when positioning the minimap. */
  margin: number;
  /** Whether the minimap should render a local radius or full room. */
  mode: 'local-radius' | 'full-room';
  /** Whether the minimap should render on mobile devices. */
  showOnMobile: boolean;
  /** Shape of the minimap mask. */
  maskShape: 'circle' | 'square';
  /** Target world width (in pixels) that should be visible inside the minimap. */
  targetWorldWidth: number;
  /** RGBA hex color used for the minimap background overlay. */
  backgroundColor: number;
  /** RGBA hex color used for the minimap border stroke. */
  borderColor: number;
  /** Alpha value for the minimap border stroke. */
  borderAlpha: number;
  /** RGBA hex color used for the player marker on the minimap. */
  playerColor: number;
  /** Desired screen radius (in pixels) for the player marker. */
  playerMarkerScreenRadius: number;
}
