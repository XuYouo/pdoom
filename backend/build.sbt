ThisBuild / scalaVersion := "3.3.6"
ThisBuild / organization := "dev.pdoom"
ThisBuild / version := "0.1.0"

lazy val root = (project in file("."))
  .settings(
    name := "pdoom-backend",
    Compile / mainClass := Some("pdoom.Main"),
    Compile / run / fork := true,
    Compile / run / javaOptions += "-DsocksNonProxyHosts=localhost|127.0.0.1|[::1]",
    Compile / resourceGenerators += Def.task {
      val source = baseDirectory.value.getParentFile / "contracts" / "api.json"
      val target = (Compile / resourceManaged).value / "contracts" / "api.json"
      IO.copyFile(source, target)
      Seq(target)
    }.taskValue,
    libraryDependencies ++= Seq(
      "org.typelevel" %% "cats-effect" % "3.5.7",
      "org.http4s" %% "http4s-ember-server" % "0.23.30",
      "org.http4s" %% "http4s-ember-client" % "0.23.30" % Test,
      "org.http4s" %% "http4s-circe" % "0.23.30",
      "io.circe" %% "circe-generic" % "0.14.10",
      "io.circe" %% "circe-parser" % "0.14.10",
      "com.zaxxer" % "HikariCP" % "5.1.0",
      "org.postgresql" % "postgresql" % "42.7.7",
      "org.slf4j" % "slf4j-simple" % "2.0.16",
      "org.typelevel" %% "munit-cats-effect" % "2.0.0" % Test
    ),
    scalacOptions ++= Seq("-deprecation", "-feature", "-unchecked"),
    Test / fork := true,
    // Process-local loopback exemption, not a system proxy configuration change.
    Test / javaOptions += "-DsocksNonProxyHosts=localhost|127.0.0.1|[::1]",
    Test / parallelExecution := false
  )
