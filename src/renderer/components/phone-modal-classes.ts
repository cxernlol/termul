/**
 * Phone fit for the hand-built modals (the ones that are not the shared
 * `ui/dialog` primitive). Desktop keeps its look; a phone gets a card that
 * fits 320–390px, stays inside the safe areas and the dynamic viewport, a
 * stacked full-width footer with the confirm on top, and 44px hit areas.
 */

/** Overlay: side gutter, and the card stays clear of the notch and home bar. */
export const PHONE_MODAL_OVERLAY_CLASS =
  'px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'

/** Card: never wider than the screen, never taller than the visible area. */
export const PHONE_MODAL_CARD_CLASS =
  'flex w-full flex-col max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)]'

/** Body: the part that scrolls when the card hits its max height. */
export const PHONE_MODAL_BODY_CLASS = 'min-h-0 overflow-y-auto overscroll-contain'

/**
 * Footer: on a phone the buttons stack full width; `flex-col-reverse` puts the
 * last button (the confirm) on top, as an iOS alert does.
 */
export const PHONE_MODAL_FOOTER_CLASS =
  'shrink-0 max-sm:flex-col-reverse max-sm:items-stretch max-sm:gap-2'

/** Footer button: full width on a phone, 44px tall on a touch screen. */
export const PHONE_MODAL_BUTTON_CLASS = 'max-sm:w-full pointer-coarse:h-11'

/**
 * A 44×44 hit area round a small control on a touch screen. The control keeps
 * its look; an invisible centred `::after` takes the tap.
 */
export const TOUCH_HIT_AREA_CLASS =
  "relative pointer-coarse:after:absolute pointer-coarse:after:left-1/2 pointer-coarse:after:top-1/2 pointer-coarse:after:size-11 pointer-coarse:after:-translate-x-1/2 pointer-coarse:after:-translate-y-1/2 pointer-coarse:after:content-['']"

/** Text field on a touch screen: 16px text (iOS does not zoom) and 44px tall. */
export const TOUCH_FIELD_CLASS = 'pointer-coarse:text-base pointer-coarse:h-11'
