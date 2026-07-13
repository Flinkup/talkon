import talkonLogo from '../assets/talkon-color-logo.png'

export function Wordmark({ className = '' }) {
  return (
    <img
      src={talkonLogo}
      alt="TalkOn"
      className={`h-8 w-auto object-contain ${className}`}
    />
  )
}

export function LogoMark({ size = 32, className = '' }) {
  return (
    <img
      src={talkonLogo}
      alt=""
      aria-hidden="true"
      style={{ height: size }}
      className={`w-auto object-contain ${className}`}
    />
  )
}

export default function Logo({ className = '' }) {
  return (
    <div className={`flex items-center ${className}`}>
      <Wordmark />
    </div>
  )
}
