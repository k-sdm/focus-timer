import { MENU_BAR } from '../lib/design'

/**
 * Decorative macOS menu bar, traced from the strip in the reference comp.
 * Drawn rather than bitmapped so it stays crisp at board scale, and set in the
 * system UI font rather than Brown — it is imitating desktop chrome, not
 * belonging to the board's own type.
 */

const size = MENU_BAR.icon
const box = { width: size, height: size, viewBox: '0 0 24 24' } as const

function Wifi() {
  return (
    <svg {...box} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M2.6 8.3a14.2 14.2 0 0 1 18.8 0" />
      <path d="M5.6 11.6a9.7 9.7 0 0 1 12.8 0" />
      <path d="M8.6 14.9a5.2 5.2 0 0 1 6.8 0" />
      <circle cx="12" cy="18.6" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function Account() {
  return (
    <svg {...box} fill="currentColor">
      <circle cx="12" cy="12" r="9.6" />
      <circle cx="12" cy="9.7" r="3.1" fill="#fff" />
      <path
        d="M12 13.5c-3.6 0-6.5 2.1-7.2 5.2a9.6 9.6 0 0 0 14.4 0c-0.7-3.1-3.6-5.2-7.2-5.2z"
        fill="#fff"
      />
    </svg>
  )
}

function InputSource() {
  return (
    <svg {...box} fill="none">
      <rect
        x="2"
        y="5.8"
        width="20"
        height="12.4"
        rx="2.6"
        stroke="currentColor"
        strokeWidth={1.8}
      />
      <rect x="5" y="9" width="6.2" height="6.2" rx="1.3" fill="currentColor" />
      <rect x="13.2" y="9.8" width="6" height="1.7" rx="0.85" fill="currentColor" />
      <rect x="13.2" y="13.2" width="6" height="1.7" rx="0.85" fill="currentColor" />
    </svg>
  )
}

function Search() {
  return (
    <svg {...box} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="10.4" cy="10.4" r="6.7" />
      <path d="M15.3 15.3L21 21" />
    </svg>
  )
}

function ControlCentre() {
  return (
    <svg {...box} fill="currentColor">
      <rect x="3" y="5" width="18" height="6.4" rx="3.2" />
      <circle cx="17.8" cy="8.2" r="2.1" fill="#fff" />
      <rect x="3" y="13.6" width="18" height="6.4" rx="3.2" />
      <circle cx="6.2" cy="16.8" r="2.1" fill="#fff" />
    </svg>
  )
}

export function MenuBar() {
  return (
    <>
      <div className="menubar__scrim" style={{ height: MENU_BAR.scrimHeight }} />
      <div
        className="menubar"
        style={{ right: MENU_BAR.right, top: MENU_BAR.top, gap: MENU_BAR.gap }}
        aria-hidden="true"
      >
        <Wifi />
        <Account />
        <InputSource />
        <Search />
        <ControlCentre />
        <span className="menubar__clock" style={{ fontSize: MENU_BAR.fontSize }}>
          Mon 20 Jul&ensp;15:48
        </span>
      </div>
    </>
  )
}
