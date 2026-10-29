package pdoom.system

sealed abstract class HttpError(val status: Int, val code: String, val publicMessage: String)
    extends RuntimeException(publicMessage)

object HttpError:
  final case class BadRequest(override val publicMessage: String) extends HttpError(400, "bad_request", publicMessage)
  case object Unauthorized extends HttpError(401, "unauthorized", "Authentication required or session expired.")
  case object Forbidden extends HttpError(403, "forbidden", "This operation is not permitted.")
  case object NotFound extends HttpError(404, "not_found", "API not found.")
  final case class Conflict(override val publicMessage: String) extends HttpError(409, "conflict", publicMessage)
  case object RateLimited extends HttpError(429, "rate_limited", "Too many attempts. Please try again later.")
  case object Internal extends HttpError(500, "internal_error", "An internal error occurred.")

  def fromValidation[A](value: Either[String, A]): Either[HttpError, A] = value.left.map(BadRequest.apply)
  def safe(error: Throwable): HttpError = error match
    case known: HttpError => known
    case _ => Internal
