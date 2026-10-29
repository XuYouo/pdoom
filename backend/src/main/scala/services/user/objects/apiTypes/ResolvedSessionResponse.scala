package pdoom.services.user.objects.apiTypes

// Internal transfer type. Never sent by a public route.
final case class ResolvedSessionResponse(userId: String, sessionId: String)
