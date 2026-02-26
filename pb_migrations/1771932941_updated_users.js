/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // update collection data
  unmarshal({
    "authRule": "verified = true",
    "mfa": {
      "duration": 300,
      "enabled": true
    },
    "otp": {
      "enabled": true
    }
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // update collection data
  unmarshal({
    "authRule": "",
    "mfa": {
      "duration": 1800,
      "enabled": false
    },
    "otp": {
      "enabled": false
    }
  }, collection)

  return app.save(collection)
})
