/*
* <license header>
*/

const { Core } = require('@adobe/aio-sdk')
const { generateAccessToken } = require('@adobe/aio-sdk').Core.AuthClient
const libDb = require('@adobe/aio-lib-db')
const { errorResponse, stringParameters, checkMissingRequestInputs } = require('../utils')

async function main (params) {
  const logger = Core.Logger('db-explorer', { level: params.LOG_LEVEL || 'info' })

  try {
    logger.info('Calling db explorer action')
    logger.debug(stringParameters(params))

    const operation = params.operation || 'find'
    const requiredParams = operation === 'listCollections' ? [] : ['collection']
    const requiredHeaders = []
    const errorMessage = checkMissingRequestInputs(params, requiredParams, requiredHeaders)
    if (errorMessage) {
      return errorResponse(400, errorMessage, logger)
    }

    const token = await generateAccessToken(params)
    if (!token?.access_token) {
      return errorResponse(401, 'unable to generate IMS access token', logger)
    }

    const dbInitOptions = { token: token.access_token }
    if (params.region) {
      dbInitOptions.region = params.region
    }
    const dbBase = await libDb.init(dbInitOptions)
    const db = await dbBase.connect()

    if (operation === 'listCollections') {
      const collections = await db.listCollections()
      return {
        statusCode: 200,
        ok: true,
        body: {
          count: collections.length,
          collections: collections.map((item) => item.name).sort()
        }
      }
    }

    const collectionName = params.collection.trim()
    const query = params.query && typeof params.query === 'object' ? params.query : {}
    const filter = query.filter && typeof query.filter === 'object' ? query.filter : query
    const projection = query.projection && typeof query.projection === 'object' ? query.projection : undefined
    const sort = query.sort && typeof query.sort === 'object' ? query.sort : undefined
    const limit = Number.isInteger(query.limit) ? query.limit : 25
    const skip = Number.isInteger(query.skip) ? query.skip : 0

    const findOptions = {}
    if (projection) {
      findOptions.projection = projection
    }
    if (limit > 0) {
      findOptions.limit = limit
    }
    if (skip > 0) {
      findOptions.skip = skip
    }
    if (sort) {
      findOptions.sort = sort
    }

    const results = await db.collection(collectionName).find(filter, findOptions).toArray()
    const totalCount = await db.collection(collectionName).countDocuments(filter)

    return {
      statusCode: 200,
      ok: true,
      body: {
        collection: collectionName,
        count: results.length,
        totalCount,
        documents: results
      }
    }
  } catch (error) {
    logger.error(error)
    return errorResponse(500, error.message || 'server error', logger)
  }
}

exports.main = main
