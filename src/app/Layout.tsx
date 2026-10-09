import type { ReactNode } from 'react'
import { Link } from './Link'
import { PLANNED_ROUTES } from './routes'

// Placeholder layout until design/ lands: plain, unstyled, every planned screen
// linked so each one can be reached and checked. NEEDS DESIGN.
export function Layout({ notice, children }: { notice?: ReactNode; children: ReactNode }) {
  const phone = PLANNED_ROUTES.filter((route) => route.device === 'phone')
  const laptop = PLANNED_ROUTES.filter((route) => route.device === 'laptop')
  return (
    <>
      <a href="#main">Skip to content</a>
      <header>
        <p>
          <Link to="/">Agapay</Link>
        </p>
        {notice}
        <nav aria-label="Screens">
          <ul>
            {phone.map((route) => (
              <li key={route.path}>
                <Link to={route.path}>{route.title}</Link>
              </li>
            ))}
          </ul>
          <p>Municipal laptop:</p>
          <ul>
            {laptop.map((route) => (
              <li key={route.path}>
                <Link to={route.path}>{route.title}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
    </>
  )
}
