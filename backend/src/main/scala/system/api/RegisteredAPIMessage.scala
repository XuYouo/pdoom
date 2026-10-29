package pdoom.system.api

import cats.effect.IO
import io.circe.{Decoder, Encoder, Json}
import io.circe.syntax.*
import java.sql.Connection
import pdoom.system.HttpError

final case class RegisteredAPIMessage[I](
    action: String,
    requiresToken: Boolean,
    rateLimited: Boolean,
    invoke: (Json, Option[I], Connection) => IO[Json]
)

object RegisteredAPIMessage:
  private def decode[A: Decoder](body: Json): IO[A] =
    IO.fromEither(body.as[A].left.map(_ => HttpError.BadRequest("Invalid request fields or types.")))

  def public[I, A: Decoder, B: Encoder](action: String, rateLimited: Boolean = false)(
      make: A => APIMessage[B]
  ): RegisteredAPIMessage[I] = RegisteredAPIMessage(action, false, rateLimited, (body, _, connection) =>
    decode[A](body).flatMap(value => make(value).plan(connection)).map(_.asJson))

  def authenticated[I, A: Decoder, B: Encoder](action: String)(
      make: (I, A) => APIWithTokenMessage[B]
  ): RegisteredAPIMessage[I] = RegisteredAPIMessage(action, true, false, (body, identity, connection) =>
    for
      caller <- IO.fromOption(identity)(HttpError.Unauthorized)
      input <- decode[A](body)
      response <- make(caller, input).plan(connection)
    yield response.asJson)

  def authenticatedEmpty[I, B: Encoder](action: String)(make: I => APIWithTokenMessage[B]): RegisteredAPIMessage[I] =
    RegisteredAPIMessage(action, true, false, (body, identity, connection) =>
      for
        _ <- IO.raiseWhen(!body.asObject.exists(_.isEmpty))(HttpError.BadRequest("Expected an empty object."))
        caller <- IO.fromOption(identity)(HttpError.Unauthorized)
        response <- make(caller).plan(connection)
      yield response.asJson)
