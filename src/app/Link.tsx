import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { navigate } from './router'

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }

// A plain <a> that navigates in the app on a normal click, and leaves new-tab
// and modified clicks to the browser.
export function Link({ to, onClick, ...props }: LinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      props.target === '_blank'
    ) {
      return
    }
    event.preventDefault()
    navigate(to)
  }
  return <a href={to} onClick={handleClick} {...props} />
}
