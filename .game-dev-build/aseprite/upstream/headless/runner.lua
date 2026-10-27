--------------------------------------------------------------------------------
-- Headless session for aseprite-ai-artist.
--
--   aseprite -b --script-param root=<package> --script headless/runner.lua
--
-- One long-lived batch process that answers the same commands the live
-- extension answers, read as JSON lines from stdin. Documents stay open in
-- memory between commands — active sprite, layer, frame and undo history
-- survive exactly as they do in the editor — and nothing reaches disk until a
-- command writes it (sprite_manage save/save_as, export).
--
-- It loads the real extension rather than a copy of its handlers, so there is
-- one command table and the two modes cannot drift. The extension skips its
-- WebSocket transport when `app.isUIAvailable` is false, which batch mode is.
--------------------------------------------------------------------------------

local root = app.params["root"] or "."
dofile(app.fs.joinPath(root, "extension", "ai-artist.lua"))

local A = _G.AI_ARTIST

-- Every reply line starts with this marker. Aseprite and `print` inside a
-- handler both write to the same stdout, and a stray warning line parsed as a
-- reply would answer the wrong call. The server ignores anything unmarked.
local MARK = "\30aia "

local function emit(payload)
  io.stdout:write(MARK .. A.encodeJson(payload) .. "\n")
  -- A pipe is block-buffered: without the flush the reply sits in the buffer
  -- while the server waits for it, and every call times out.
  io.stdout:flush()
end

emit({
  type = "hello",
  protocol = A.protocol,
  extensionVersion = A.version,
  asepriteVersion = tostring(app.version),
  features = A.features,
  headless = true,
})

-- Blocks on each read, which is what keeps the process — and its documents —
-- alive between commands. EOF (the server closed stdin) ends the session.
for line in io.stdin:lines() do
  if line ~= "" then
    local parsed, decoded = pcall(json.decode, line)
    local frame = parsed and A.toPlain(decoded) or nil
    if type(frame) == "table" and frame.id ~= nil then
      local replied, reply = pcall(A.handleCommand, frame)
      if not replied then
        reply = { id = frame.id, ok = false,
          error = { code = "aseprite_error", message = tostring(reply), details = {} } }
      end
      emit(reply)
    end
  end
end
