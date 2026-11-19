package pdoom.services.game.realtime

import io.circe.{Json, JsonObject}
import cats.syntax.all.*
import io.circe.parser.parse
import java.nio.charset.StandardCharsets
import java.util.UUID

final case class CoopError(code: String, publicMessage: String, fatal: Boolean = false, closeCode: Int = 1008)
    extends RuntimeException(publicMessage)

enum CoopMessage:
  case Auth(token: String)
  case Create(id: String, build: String)
  case Join(id: String, code: String, build: String)
  case Ready(id: String, ready: Boolean)
  case Start(id: String)
  case Leave(id: String)
  case Reconnect(id: String, roomId: String)
  case Command(id: String, action: String)
  case Input(seq: Long, payload: Json)
  case State(seq: Long, payload: Json)
  case Ping

  def requestId: Option[String] = this match
    case Create(id, _) => Some(id)
    case Join(id, _, _) => Some(id)
    case Ready(id, _) => Some(id)
    case Start(id) => Some(id)
    case Leave(id) => Some(id)
    case Reconnect(id, _) => Some(id)
    case Command(id, _) => Some(id)
    case _ => None

object CoopProtocol:
  val BuildId = "pdoom-coop-v1"
  val MaxBytes = 65536
  private def bad = CoopError("bad_message", "消息格式无效。", true)
  private def expect(test: Boolean): Either[CoopError, Unit] = Either.cond(test, (), bad)
  private def string(obj: JsonObject, key: String): Either[CoopError, String] = obj(key).flatMap(_.asString).toRight(bad)
  private def bool(obj: JsonObject, key: String): Either[CoopError, Boolean] = obj(key).flatMap(_.asBoolean).toRight(bad)
  private def keys(obj: JsonObject, expected: String*): Either[CoopError, Unit] =
    expect(obj.keys.toSet == (Set("v", "type") ++ expected))
  private def id(obj: JsonObject): Either[CoopError, String] = string(obj, "requestId").flatMap(value =>
    expect(value.matches("[A-Za-z0-9_-]{1,64}")).as(value))
  private def sequence(obj: JsonObject): Either[CoopError, Long] = obj("seq").flatMap(_.asNumber).flatMap(_.toLong)
    .filter(value => value >= 0 && value <= 9007199254740991L).toRight(bad)
  private def build(obj: JsonObject): Either[CoopError, String] = string(obj, "buildId").flatMap(value =>
    expect(value.matches("[A-Za-z0-9_.-]{1,64}")).as(value))
  private def payload(obj: JsonObject): Either[CoopError, Json] = obj("payload").filter(_.isObject).toRight(bad)
  private def finite(value: Json): Boolean = value.asNumber.exists(n => n.toDouble.isFinite && math.abs(n.toDouble) <= 1e6)

  // The transport bounds work before any domain decoder or room mutation runs.
  private def bounded(value: Json, depth: Int = 0): Boolean =
    depth <= 16 && value.fold(
      true, _ => true, number => number.toDouble.isFinite,
      _.length <= 8192,
      values => values.size <= 4096 && values.forall(bounded(_, depth + 1)),
      obj => obj.size <= 256 && obj.toIterable.forall { case (key, child) => key.length <= 128 && bounded(child, depth + 1) })

  private def input(value: Json): Boolean = value.asObject.exists { obj =>
    val booleans = Set("jumpPressed", "jumpHeld", "dashPressed", "fire", "rewindPressed", "insightPressed")
    val required = booleans ++ Set("move", "aim")
    val aim = obj("aim").exists(v => v.isNull || v.asObject.exists(a => a.keys.toSet == Set("x", "y") && a.values.forall(finite)))
    required.subsetOf(obj.keys.toSet) && obj.keys.toSet.subsetOf(required ++ Set("rerollPressed", "reviveHeld")) &&
      booleans.forall(key => obj(key).exists(_.isBoolean)) && obj("rerollPressed").forall(_.isBoolean) && obj("reviveHeld").forall(_.isBoolean) &&
      obj("move").flatMap(_.asNumber).flatMap(_.toInt).exists(Set(-1, 0, 1)) && aim
  }

  def decode(text: String): Either[CoopError, CoopMessage] =
    if text.getBytes(StandardCharsets.UTF_8).length > MaxBytes then
      Left(CoopError("message_too_large", "消息超过大小上限。", true, 1009))
    else for
      json <- parse(text).left.map(_ => bad)
      _ <- expect(bounded(json))
      obj <- json.asObject.toRight(bad)
      version <- obj("v").flatMap(_.asNumber).flatMap(_.toInt).toRight(bad)
      _ <- Either.cond(version == 1, (), CoopError("unsupported_version", "联机协议版本不兼容，请刷新页面。", true))
      kind <- string(obj, "type")
      result <- kind match
        case "auth" =>
          for
            _ <- keys(obj, "token")
            token <- string(obj, "token")
            _ <- expect(token.matches("[A-Za-z0-9_-]{43}"))
          yield CoopMessage.Auth(token)
        case "create" =>
          for
            _ <- keys(obj, "requestId", "buildId")
            request <- id(obj)
            version <- build(obj)
          yield CoopMessage.Create(request, version)
        case "join" =>
          for
            _ <- keys(obj, "requestId", "code", "buildId")
            request <- id(obj)
            code <- string(obj, "code")
            _ <- expect(code.matches("[A-Z2-9]{8}"))
            version <- build(obj)
          yield CoopMessage.Join(request, code, version)
        case "ready" =>
          for
            _ <- keys(obj, "requestId", "ready")
            request <- id(obj)
            ready <- bool(obj, "ready")
          yield CoopMessage.Ready(request, ready)
        case "start" =>
          for
            _ <- keys(obj, "requestId")
            request <- id(obj)
          yield CoopMessage.Start(request)
        case "leave" =>
          for
            _ <- keys(obj, "requestId")
            request <- id(obj)
          yield CoopMessage.Leave(request)
        case "reconnect" =>
          for
            _ <- keys(obj, "requestId", "roomId")
            request <- id(obj)
            room <- string(obj, "roomId")
            _ <- expect(scala.util.Try(UUID.fromString(room)).toOption.exists(_.toString == room))
          yield CoopMessage.Reconnect(request, room)
        case "command" =>
          for
            _ <- keys(obj, "requestId", "action")
            request <- id(obj)
            action <- string(obj, "action")
            _ <- expect(Set("pause", "resume", "continue-ready").contains(action))
          yield CoopMessage.Command(request, action)
        case "input" | "state" =>
          for
            _ <- keys(obj, "seq", "payload")
            seq <- sequence(obj)
            data <- payload(obj)
            _ <- expect(kind != "input" || (text.getBytes(StandardCharsets.UTF_8).length <= 2048 && input(data)))
          yield if kind == "input" then CoopMessage.Input(seq, data) else CoopMessage.State(seq, data)
        case "ping" => keys(obj).as(CoopMessage.Ping)
        case _ => Left(bad)
    yield result

  def event(kind: String, fields: (String, Json)*): Json =
    Json.obj((Seq("v" -> Json.fromInt(1), "type" -> Json.fromString(kind)) ++ fields)*)
  def error(value: CoopError, requestId: Option[String] = None): Json =
    event("error", (Seq("code" -> Json.fromString(value.code), "message" -> Json.fromString(value.publicMessage)) ++
      requestId.map("requestId" -> Json.fromString(_)))*)

