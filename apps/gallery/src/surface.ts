/**
 * The one opaque colour every gallery card is painted with.
 *
 * A cut-out eye is filled with the surface it sits on, so the wall cell, the strip
 * cell and the detail card must agree on a single colour and actually paint it: a
 * `transparent` cell over a gradient would leave the eye matching neither. The value
 * is the page background, so an untouched cell looks the same as before.
 */
export const GALLERY_SURFACE = "#0b0f14";
