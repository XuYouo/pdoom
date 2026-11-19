package pdoom.tests.realtime

import io.circe.Json
import io.circe.parser.parse
import munit.FunSuite
import pdoom.services.game.realtime.CoopProtocol

/** Mirrors the client input-boundary cases in tests/frontend/coop-input.test.ts. */
class CoopProtocolSuite extends FunSuite:
  private val required = parse("""{"move":0,"jumpPressed":false,"jumpHeld":false,"dashPressed":false,"fire":false,"aim":null,"rewindPressed":false,"insightPressed":false}""").toOption.get
  private val full = required.mapObject(_.add("rerollPressed", Json.False).add("reviveHeld", Json.False))
  private def decodeInput(payload: Json) = CoopProtocol.decode(Json.obj(
    "v" -> Json.fromInt(1), "type" -> Json.fromString("input"), "seq" -> Json.fromInt(1), "payload" -> payload).noSpaces)
  private def withAim(axis: String, value: Json): Json = full.mapObject(_.add("aim",
    Json.obj("x" -> Json.fromInt(0), "y" -> Json.fromInt(0)).mapObject(_.add(axis, value))))

  test("input allows omitted optional controls and preserves explicit booleans") {
    for omitted <- List(List("rerollPressed"), List("reviveHeld"), List("rerollPressed", "reviveHeld")) do
      assert(decodeInput(full.mapObject(obj => omitted.foldLeft(obj)((current, key) => current.remove(key)))).isRight)
    for key <- List("rerollPressed", "reviveHeld"); value <- List(Json.False, Json.True) do
      assert(decodeInput(full.mapObject(_.add(key, value))).isRight)
  }

  test("input rejects explicit non-boolean optional controls") {
    for key <- List("rerollPressed", "reviveHeld"); value <- List(Json.Null, Json.fromInt(0), Json.fromInt(1), Json.fromString("false")) do
      assert(decodeInput(full.mapObject(_.add(key, value))).isLeft)
  }

  test("input aim coordinates use inclusive plus or minus one million bounds") {
    for axis <- List("x", "y"); value <- List(-1000000, -500000, 500000, 1000000) do
      assert(decodeInput(withAim(axis, Json.fromInt(value))).isRight)
    for axis <- List("x", "y"); value <- List(Json.fromInt(-1000001), Json.fromInt(1000001), parse("1e999").toOption.get) do
      assert(decodeInput(withAim(axis, value)).isLeft)
  }

  test("input requires mandatory fields and rejects unknown input or aim fields") {
    for key <- required.asObject.get.keys do
      assert(decodeInput(full.mapObject(_.remove(key))).isLeft)
    assert(decodeInput(full.mapObject(_.add("slot", Json.fromInt(0)))).isLeft)
    for raw <- List("""{"x":0}""", """{"y":0}""", """{"x":0,"y":0,"z":0}""", "[0,0]", """{"x":"0","y":0}""") do
      assert(decodeInput(full.mapObject(_.add("aim", parse(raw).toOption.get))).isLeft)
  }
