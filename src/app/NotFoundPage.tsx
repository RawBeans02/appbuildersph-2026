import { Link } from './Link'

// NEEDS DESIGN: the designed 404 (design pass 2).
export function NotFoundPage() {
  return (
    <>
      <h1>Page not found</h1>
      <p>
        <Link to="/">Go to the start screen</Link>
      </p>
    </>
  )
}
