/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1930317162")

  // remove field
  collection.fields.removeById("select2734263879")

  // add field
  collection.fields.addAt(4, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text491676904",
    "max": 0,
    "min": 0,
    "name": "company_name",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(5, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text2734263879",
    "max": 0,
    "min": 0,
    "name": "channel",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1930317162")

  // add field
  collection.fields.addAt(4, new Field({
    "hidden": false,
    "id": "select2734263879",
    "maxSelect": 1,
    "name": "channel",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "Discord",
      "Email",
      "LinkedIn",
      "Mail",
      "Contact Form"
    ]
  }))

  // remove field
  collection.fields.removeById("text491676904")

  // remove field
  collection.fields.removeById("text2734263879")

  return app.save(collection)
})
