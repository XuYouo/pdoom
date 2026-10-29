package pdoom.services.user

import cats.effect.IO
import munit.CatsEffectSuite
import pdoom.services.user.utils.{Passwords, Tokens, ValidateCredentials}

class SecuritySuite extends CatsEffectSuite:
  test("PBKDF2 uses distinct salts and rejects wrong passwords") {
    for
      first <- Passwords.hash("fixture-password-only")
      second <- Passwords.hash("fixture-password-only")
      correct <- Passwords.verify("fixture-password-only", first)
      wrong <- Passwords.verify("incorrect", first)
    yield
      assertEquals(first.iterations, 600000)
      assertNotEquals(first.salt, second.salt)
      assertNotEquals(first.digest, second.digest)
      assert(correct)
      assert(!wrong)
  }

  test("opaque tokens have 256-bit entropy encoding and one-way stored hashes") {
    for
      first <- Tokens.generate
      second <- Tokens.generate
      hash <- Tokens.digest(first)
      repeat <- Tokens.digest(first)
    yield
      assert(first.matches("[A-Za-z0-9_-]{43}"))
      assertNotEquals(first, second)
      assert(hash.matches("[a-f0-9]{64}"))
      assertNotEquals(hash, first)
      assertEquals(hash, repeat)
  }

  test("credential validation normalizes names and bounds password work") {
    IO {
      assertEquals(ValidateCredentials.username("Alice_1"), Right("alice_1"))
      assert(ValidateCredentials.username("bad' OR 1=1 --").isLeft)
      assert(ValidateCredentials.password("short").isLeft)
      assert(ValidateCredentials.password("x" * 129).isLeft)
    }
  }
