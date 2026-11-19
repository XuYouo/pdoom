package pdoom.services.game.realtime

import cats.effect.{Deferred, IO, Ref, Resource}
import cats.effect.std.{Queue, Semaphore}
import cats.syntax.all.*
import fs2.Stream
import io.circe.Json
import org.http4s.websocket.WebSocketFrame
import pdoom.services.user.objects.AuthenticatedUser
import java.security.SecureRandom
import java.util.UUID
import scala.concurrent.duration.*

final class CoopPeer private[realtime] (
    val id: String,
    private[realtime] val controls: Queue[IO, Json],
    private[realtime] val snapshots: Queue[IO, Json],
    private[realtime] val closed: Deferred[IO, Option[CoopError]]):
  def outgoing: Stream[IO, WebSocketFrame] =
    val messages = Stream.fromQueueUnterminated(controls).merge(Stream.fromQueueUnterminated(snapshots))
      .map(json => WebSocketFrame.Text(json.noSpaces): WebSocketFrame)
    val heartbeat = Stream.awakeEvery[IO](5.seconds).map(_ => WebSocketFrame.Ping(): WebSocketFrame)
    messages.merge(heartbeat).interruptWhen(closed.get.void.attempt) ++ Stream.eval(closed.get).flatMap { reason =>
      val error = reason.fold(Stream.empty.covary[IO])(value => Stream.emit(WebSocketFrame.Text(CoopProtocol.error(value).noSpaces): WebSocketFrame))
      error ++ Stream.emit(WebSocketFrame.Close(reason.fold(1000)(_.closeCode)).toOption.get: WebSocketFrame)
    }

/** One process owns rooms; only short authentication IO crosses into the user domain/DB. */
final class CoopRuntime private (
    state: Ref[IO, CoopRuntime.Store],
    gate: Semaphore[IO],
    authenticate: String => IO[AuthenticatedUser],
    validateSession: AuthenticatedUser => IO[Unit],
    grace: FiniteDuration):
  import CoopRuntime.*
  import CoopMessage.*
  private def now: IO[Long] = IO.monotonic.map(_.toMillis)
  private def fail(code: String, message: String): IO[Nothing] = IO.raiseError(CoopError(code, message))
  private def locked[A](work: IO[A]): IO[A] = gate.permit.use(_ => work)
  private def peer(id: String): IO[PeerState] = state.get.flatMap(s => IO.fromOption(s.peers.get(id))(
    CoopError("unauthorized", "连接已关闭，请重新连接。", true)))
  private def user(value: PeerState): IO[AuthenticatedUser] = IO.fromOption(value.user)(
    CoopError("unauthorized", "请先登录并认证连接。", true))
  private def currentRoom(value: PeerState): IO[Room] = state.get.flatMap(s =>
    IO.fromOption(value.roomId.flatMap(s.rooms.get))(CoopError("not_in_room", "你尚未加入房间。")))
  private def member(room: Room, id: String): IO[Int] = IO.fromOption(room.seats.indexWhere(_.peerId.contains(id)) match
    case -1 => None
    case value => Some(value))(CoopError("forbidden", "当前连接不是房间成员。"))
  private def putRoom(room: Room): IO[Unit] = state.update(s => s.copy(rooms = s.rooms.updated(room.id, room)))
  private def send(id: String, json: Json, snapshot: Boolean = false): IO[Unit] = state.get.flatMap(_.peers.get(id).traverse_ { value =>
    if snapshot then value.peer.snapshots.offer(json)
    else value.peer.controls.tryOffer(json).flatMap(ok => if ok then IO.unit else
      value.peer.closed.complete(Some(CoopError("slow_consumer", "连接处理过慢，请重新连接。", true))).void)
  })
  private def ack(id: String, request: Option[String]): IO[Unit] = request.traverse_(value =>
    send(id, CoopProtocol.event("ack", "requestId" -> Json.fromString(value))))
  private def broadcast(room: Room): IO[Unit] = room.seats.zipWithIndex.traverse_ { case (seat, slot) =>
    seat.peerId.traverse_(send(_, CoopProtocol.event("room",
      "roomId" -> Json.fromString(room.id), "code" -> Json.fromString(room.code),
      "buildId" -> Json.fromString(CoopProtocol.BuildId), "phase" -> Json.fromString(room.phase),
      "version" -> Json.fromLong(room.version), "selfSlot" -> Json.fromInt(slot),
      "players" -> Json.arr(room.seats.zipWithIndex.map { case (entry, index) => Json.obj(
        "slot" -> Json.fromInt(index), "connected" -> Json.fromBoolean(entry.peerId.isDefined), "ready" -> Json.fromBoolean(entry.ready)) }*),
      "matchId" -> room.matchId.fold(Json.Null)(Json.fromString))))
  }
  private def updateRoom(room: Room): IO[Unit] = putRoom(room) *> broadcast(room)
  private def closeRoom(room: Room, reason: String): IO[Unit] =
    state.update(s => s.copy(rooms = s.rooms - room.id, peers = s.peers.map { case (id, value) =>
      id -> (if value.roomId.contains(room.id) then value.copy(roomId = None) else value)
    })) *> room.seats.flatMap(_.peerId).traverse_(send(_, CoopProtocol.event("closed",
      "roomId" -> Json.fromString(room.id), "reason" -> Json.fromString(reason))))

  def connect: Resource[IO, CoopPeer] = Resource.make(for
    controls <- Queue.bounded[IO, Json](64)
    snapshots <- Queue.circularBuffer[IO, Json](1)
    closed <- Deferred[IO, Option[CoopError]]
    connection = new CoopPeer(UUID.randomUUID().toString, controls, snapshots, closed)
    time <- now
    _ <- locked(state.get.flatMap { s =>
      if s.peers.size >= 128 then closed.complete(Some(CoopError("capacity", "联机服务暂时满员，请稍后重试。", true, 1013))).void
      else state.set(s.copy(peers = s.peers.updated(connection.id, PeerState(connection, None, None, time, time))))
    })
  yield connection)(connection => disconnect(connection.id))

  def touch(id: String): IO[Unit] = now.flatMap(time => state.update(s => s.copy(peers = s.peers.updatedWith(id)(_.map(_.copy(lastSeen = time))))))
  def shutdown(id: String, error: CoopError): IO[Unit] = state.get.flatMap(_.peers.get(id).traverse_(_.peer.closed.complete(Some(error)).void))

  def receive(id: String, text: String): IO[Unit] =
    val message = CoopProtocol.decode(text)
    val process = message match
      case Left(error) => IO.raiseError(error)
      case Right(Auth(token)) => authorize(id, token)
      case Right(value) =>
        val revalidate = value match
          case _: Create | _: Join | _: Start | _: Reconnect => peer(id).flatMap(user).flatMap(validateSession)
          case _ => IO.unit
        revalidate *> locked(for
          connection <- peer(id)
          identity <- user(connection)
          time <- now
          _ <- charge(connection, value, time)
          _ <- dispatch(id, identity, value, time)
          _ <- ack(id, value.requestId)
        yield ())
    touch(id) *> process.handleErrorWith {
      case error: CoopError => if error.fatal then shutdown(id, error) else send(id, CoopProtocol.error(error, message.toOption.flatMap(_.requestId)))
      case pdoom.system.HttpError.Unauthorized => shutdown(id, CoopError("unauthorized", "登录已失效，请重新登录。", true))
      case _ => shutdown(id, CoopError("auth_unavailable", "暂时无法验证登录，请稍后重连。", true, 1013))
    }

  private def authorize(id: String, token: String): IO[Unit] = for
    _ <- locked(for
      connection <- peer(id)
      time <- now
      _ <- if connection.authAttempted || connection.user.isDefined || time - connection.createdAt >= 5000 then
        IO.raiseError(CoopError("unauthorized", "连接认证无效。", true)) else IO.unit
      _ <- state.update(s => s.copy(peers = s.peers.updated(id, connection.copy(authAttempted = true))))
    yield ())
    identity <- authenticate(token)
    _ <- locked(for
      connection <- peer(id)
      _ <- state.update(s => s.copy(peers = s.peers.updated(id, connection.copy(user = Some(identity)))))
      _ <- send(id, CoopProtocol.event("authenticated"))
    yield ())
  yield ()

  private def charge(connection: PeerState, message: CoopMessage, time: Long): IO[Unit] =
    val (key, limit, window) = message match
      case _: Input => ("input", 60, 1000L)
      case _: State => ("state", 20, 1000L)
      case Ping => ("ping", 6, 10000L)
      case _ => ("control", 30, 10000L)
    val prior = connection.budgets.get(key).filter(b => time - b.start < window).getOrElse(Budget(time, 0))
    if prior.count >= limit then IO.raiseError(CoopError("rate_limited", "操作过于频繁，请稍后重连。", true))
    else state.update(s => s.copy(peers = s.peers.updated(connection.peer.id,
      connection.copy(budgets = connection.budgets.updated(key, prior.copy(count = prior.count + 1))))))

  private def noExistingRoom(identity: AuthenticatedUser): IO[Unit] = state.get.flatMap { s =>
    if s.rooms.values.exists(_.seats.exists(_.userId == identity.userId.value.toString)) then
      fail("already_in_room", "你已在房间中，请重连或先退出。") else IO.unit
  }
  private def checkBuild(build: String): IO[Unit] =
    if build == CoopProtocol.BuildId then IO.unit else fail("build_mismatch", "游戏版本不同，请双方刷新页面。")
  private def bind(id: String, roomId: String): IO[Unit] =
    state.update(s => s.copy(peers = s.peers.updatedWith(id)(_.map(_.copy(roomId = Some(roomId))))))
  private def sequence(id: String, kind: String, seq: Long): IO[Unit] = peer(id).flatMap { connection =>
    if connection.sequences.get(kind).exists(_ >= seq) then fail("stale_sequence", "已忽略过期的联机消息。")
    else state.update(s => s.copy(peers = s.peers.updated(id, connection.copy(sequences = connection.sequences.updated(kind, seq)))))
  }
  private def dispatch(id: String, identity: AuthenticatedUser, message: CoopMessage, time: Long): IO[Unit] = message match
    case Create(_, build) =>
      for
        _ <- checkBuild(build)
        _ <- noExistingRoom(identity)
        s <- state.get
        _ <- if s.rooms.size >= 64 then fail("capacity", "房间数量已满，请稍后重试。") else IO.unit
        code <- IO.delay {
          var value = randomCode()
          while s.rooms.values.exists(_.code == value) do value = randomCode()
          value
        }
        room = Room(UUID.randomUUID().toString, code, Vector(Seat(identity.userId.value.toString, Some(id), false, None)), "lobby", None, 1L, time)
        _ <- bind(id, room.id)
        _ <- updateRoom(room)
      yield ()
    case Join(_, code, build) =>
      for
        _ <- checkBuild(build)
        _ <- noExistingRoom(identity)
        s <- state.get
        room <- IO.fromOption(s.rooms.values.find(_.code == code))(CoopError("room_not_found", "邀请码无效或房间已结束。"))
        _ <- if room.seats.size >= 2 then fail("room_full", "房间已有两位玩家。") else IO.unit
        _ <- if room.phase != "lobby" then fail("invalid_phase", "当前房间无法加入。") else IO.unit
        updated = room.copy(seats = room.seats.map(_.copy(ready = false)) :+ Seat(identity.userId.value.toString, Some(id), false, None), version = room.version + 1, updatedAt = time)
        _ <- bind(id, room.id)
        _ <- updateRoom(updated)
      yield ()
    case Ready(_, ready) =>
      for
        connection <- peer(id)
        room <- currentRoom(connection)
        slot <- member(room, id)
        _ <- if room.phase != "lobby" then fail("invalid_phase", "仅等待室可以准备。") else IO.unit
        _ <- updateRoom(room.copy(seats = room.seats.updated(slot, room.seats(slot).copy(ready = ready)), version = room.version + 1, updatedAt = time))
      yield ()
    case Start(_) =>
      for
        connection <- peer(id)
        room <- currentRoom(connection)
        slot <- member(room, id)
        _ <- if slot != 0 then fail("forbidden", "只有房主可以开始。") else IO.unit
        _ <- if room.phase != "lobby" then fail("invalid_phase", "当前房间不能开始。") else IO.unit
        _ <- if room.seats.size != 2 || !room.seats.forall(s => s.ready && s.peerId.isDefined) then fail("not_ready", "需要两位玩家在线并准备。") else IO.unit
        _ <- updateRoom(room.copy(phase = "playing", matchId = Some(UUID.randomUUID().toString), version = room.version + 1, updatedAt = time))
      yield ()
    case Leave(_) =>
      for
        connection <- peer(id)
        _ <- connection.roomId.traverse_ { roomId => state.get.flatMap(_.rooms.get(roomId).traverse_ { room =>
          member(room, id).flatMap { slot =>
            send(id, CoopProtocol.event("left", "roomId" -> Json.fromString(room.id))) *>
            (if slot == 0 then closeRoom(room, "host_left")
             else if room.matchId.isDefined then closeRoom(room, "guest_left")
             else state.update(s => s.copy(peers = s.peers.updatedWith(id)(_.map(_.copy(roomId = None))))) *>
               updateRoom(room.copy(seats = room.seats.take(1).map(_.copy(ready = false)),
                 phase = if room.seats.head.peerId.isDefined then "lobby" else "reconnecting", version = room.version + 1, updatedAt = time)))
          }
        }) }
      yield ()
    case Reconnect(_, roomId) =>
      for
        connection <- peer(id)
        _ <- if connection.roomId.exists(_ != roomId) then fail("already_in_room", "请先退出当前房间。") else IO.unit
        s <- state.get
        room <- IO.fromOption(s.rooms.get(roomId))(CoopError("room_not_found", "房间已结束，无法重连。"))
        slot <- IO.fromOption(room.seats.indexWhere(_.userId == identity.userId.value.toString) match
          case -1 => None
          case value => Some(value))(CoopError("forbidden", "只有原房间成员可以重连。"))
        _ <- if room.seats.exists(_.disconnectedAt.exists(at => time - at >= grace.toMillis)) then
          closeRoom(room, "reconnect_timeout") *> fail("room_not_found", "重连等待已超时。") else IO.unit
        _ <- room.seats(slot).peerId.filter(_ != id).traverse_ { previous =>
          state.update(s => s.copy(peers = s.peers.updatedWith(previous)(_.map(_.copy(roomId = None))))) *>
            shutdown(previous, CoopError("connection_replaced", "此席位已在新的连接中恢复。", true))
        }
        seats = room.seats.updated(slot, room.seats(slot).copy(peerId = Some(id), disconnectedAt = None, ready = false))
        phase = if room.matchId.isEmpty && seats.forall(_.peerId.isDefined) then "lobby" else "reconnecting"
        _ <- bind(id, room.id)
        _ <- updateRoom(room.copy(seats = seats, phase = phase, resynced = false, version = room.version + 1, updatedAt = time))
      yield ()
    case Input(seq, payload) => relay(id, "input", seq, payload, time)
    case State(seq, payload) => relay(id, "state", seq, payload, time)
    case Command(requestId, action) =>
      for
        connection <- peer(id)
        room <- currentRoom(connection)
        slot <- member(room, id)
        _ <- if room.matchId.isEmpty then fail("invalid_phase", "请先开始合作训练。") else IO.unit
        _ <- if action == "resume" && slot != 0 then fail("forbidden", "只有房主可以恢复训练。") else IO.unit
        _ <- if action != "pause" && room.phase == "reconnecting" && action != "resume" then fail("reconnect_pending", "等待队友重连。") else IO.unit
        _ <- if action == "resume" && !room.seats.forall(_.peerId.isDefined) then fail("reconnect_pending", "等待队友重连。") else IO.unit
        _ <- if action == "resume" && room.phase == "reconnecting" && !room.resynced then fail("resync_required", "请先同步最新世界。") else IO.unit
        active = if action == "resume" && room.phase == "reconnecting" then room.copy(phase = "playing", version = room.version + 1, updatedAt = time) else room
        _ <- if active != room then updateRoom(active) else IO.unit
        event = envelope(active, slot, "command", "requestId" -> Json.fromString(requestId), "action" -> Json.fromString(action))
        _ <- active.seats.flatMap(_.peerId).traverse_(send(_, event))
      yield ()
    case Ping => send(id, CoopProtocol.event("pong"))
    case _: Auth => IO.raiseError(CoopError("bad_message", "不能重复认证连接。", true))

  private def envelope(room: Room, slot: Int, kind: String, fields: (String, Json)*): Json =
    CoopProtocol.event(kind, (Seq("roomId" -> Json.fromString(room.id), "matchId" -> room.matchId.fold(Json.Null)(Json.fromString), "slot" -> Json.fromInt(slot)) ++ fields)*)
  private def relay(id: String, kind: String, seq: Long, payload: Json, time: Long): IO[Unit] = for
    connection <- peer(id)
    room <- currentRoom(connection)
    slot <- member(room, id)
    _ <- if (kind == "state" && slot != 0) || (kind == "input" && slot != 1) then fail("forbidden", "当前席位不能发送此类消息。") else IO.unit
    _ <- if room.matchId.isEmpty || (kind == "input" && room.phase != "playing") then fail("invalid_phase", "当前房间暂停或尚未开始。") else IO.unit
    _ <- sequence(id, kind, seq)
    _ <- if kind == "state" && room.phase == "reconnecting" && room.seats.forall(_.peerId.isDefined) then putRoom(room.copy(resynced = true)) else IO.unit
    event = envelope(room, slot, kind, "connectionId" -> Json.fromString(id), "seq" -> Json.fromLong(seq), "payload" -> payload)
    _ <- room.seats.zipWithIndex.filter(_._2 != slot).flatMap(_._1.peerId).traverse_(send(_, event, snapshot = kind == "state"))
  yield ()

  def disconnect(id: String): IO[Unit] = locked(for
    s <- state.get
    time <- now
    _ <- s.peers.get(id).traverse_ { connection =>
      state.update(value => value.copy(peers = value.peers - id)) *>
        connection.peer.closed.complete(None).void *>
        connection.roomId.flatMap(s.rooms.get).traverse_ { room =>
          val slot = room.seats.indexWhere(_.peerId.contains(id))
          if slot < 0 then IO.unit else updateRoom(room.copy(
            seats = room.seats.updated(slot, room.seats(slot).copy(peerId = None, ready = false, disconnectedAt = Some(time))),
            phase = "reconnecting", resynced = false, version = room.version + 1, updatedAt = time))
        }
    }
  yield ())

  private[realtime] def sweep: IO[Unit] = locked(for
    time <- now
    s <- state.get
    _ <- s.peers.values.toList.traverse_ { connection =>
      val error = if connection.user.isEmpty && time - connection.createdAt >= 5000 then Some(CoopError("auth_timeout", "连接认证超时。", true))
        else if time - connection.lastSeen >= 15000 then Some(CoopError("heartbeat_timeout", "连接已中断，请重连。", true)) else None
      error.traverse_(value => connection.peer.closed.complete(Some(value)).void)
    }
    _ <- s.rooms.values.toList.traverse_ { room =>
      if room.seats.exists(_.disconnectedAt.exists(at => time - at >= grace.toMillis)) then closeRoom(room, "reconnect_timeout")
      else if room.matchId.isEmpty && time - room.updatedAt >= 30.minutes.toMillis then closeRoom(room, "room_expired")
      else IO.unit
    }
  yield ())

  private def validatePeers: IO[Unit] = state.get.flatMap(_.peers.values.toList.traverse_ { connection =>
    connection.user.traverse_(identity => validateSession(identity).attempt.flatMap {
      case Right(_) => IO.unit
      case Left(pdoom.system.HttpError.Unauthorized) => shutdown(connection.peer.id, CoopError("unauthorized", "登录已失效，请重新登录。", true))
      case Left(_) => shutdown(connection.peer.id, CoopError("auth_unavailable", "暂时无法验证登录，请稍后重连。", true, 1013))
    })
  })

object CoopRuntime:
  private case class Budget(start: Long, count: Int)
  private case class PeerState(peer: CoopPeer, user: Option[AuthenticatedUser], roomId: Option[String], createdAt: Long, lastSeen: Long,
      authAttempted: Boolean = false, sequences: Map[String, Long] = Map.empty, budgets: Map[String, Budget] = Map.empty)
  private case class Seat(userId: String, peerId: Option[String], ready: Boolean, disconnectedAt: Option[Long])
  private case class Room(id: String, code: String, seats: Vector[Seat], phase: String, matchId: Option[String], version: Long,
      updatedAt: Long, resynced: Boolean = false)
  private case class Store(peers: Map[String, PeerState] = Map.empty, rooms: Map[String, Room] = Map.empty)
  private val random = new SecureRandom()
  private val alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  private def randomCode(): String = (0 until 8).map(_ => alphabet.charAt(random.nextInt(alphabet.length))).mkString

  def resource(authenticate: String => IO[AuthenticatedUser], validateSession: AuthenticatedUser => IO[Unit],
      grace: FiniteDuration = 30.seconds): Resource[IO, CoopRuntime] = for
    state <- Resource.eval(Ref.of[IO, Store](Store()))
    gate <- Resource.eval(Semaphore[IO](1))
    runtime = new CoopRuntime(state, gate, authenticate, validateSession, grace)
    _ <- Resource.make((Stream.awakeEvery[IO](1.second).evalMap(_ => runtime.sweep).compile.drain).start)(_.cancel)
    _ <- Resource.make((Stream.awakeEvery[IO](10.seconds).evalMap(_ => runtime.validatePeers).compile.drain).start)(_.cancel)
  yield runtime
