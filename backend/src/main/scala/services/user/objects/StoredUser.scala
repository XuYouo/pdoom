package pdoom.services.user.objects

final case class StoredUser(user: User, password: PasswordHash)
