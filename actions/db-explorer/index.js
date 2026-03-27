/*
* <license header>
*/

const { Core } = require('@adobe/aio-sdk')
const { generateAccessToken } = require('@adobe/aio-sdk').Core.AuthClient
const libDb = require('@adobe/aio-lib-db')
const libState = require('@adobe/aio-lib-state')
const libFiles = require('@adobe/aio-lib-files')
const { errorResponse, stringParameters, checkMissingRequestInputs } = require('../utils')

async function main (params) {
  const logger = Core.Logger('db-explorer', { level: params.LOG_LEVEL || 'info' })

  try {
    logger.info('Calling db explorer action')
    logger.debug(stringParameters(params))

    const operation = params.operation
    const requiredParams = getRequiredParams(operation)
    const requiredHeaders = []
    const errorMessage = checkMissingRequestInputs(params, requiredParams, requiredHeaders)
    if (errorMessage) {
      return errorResponse(400, errorMessage, logger)
    }

    if (operation.startsWith('db.')) {
      const token = await generateAccessToken(params)
      if (!token?.access_token) {
        return errorResponse(401, 'unable to generate IMS access token', logger)
      }
      return await handleDbOperation(params, operation, token.access_token)
    }
    if (operation.startsWith('state.')) {
      return await handleStateOperation(params, operation)
    }
    if (operation.startsWith('files.')) {
      return await handleFilesOperation(params, operation)
    }
    return errorResponse(400, `unsupported operation: ${operation}`, logger)
  } catch (error) {
    logger.error(error)
    return errorResponse(500, error.message || 'server error', logger)
  }
}

function getRequiredParams (operation) {
  switch (operation) {
    case 'db.listCollections':
      return []
    case 'db.find':
      return ['collection']
    case 'state.list':
      return []
    case 'state.get':
      return ['key']
    case 'files.list':
      return []
    case 'files.getProperties':
      return ['filePath']
    default:
      return []
  }
}

async function handleDbOperation (params, operation, accessToken) {
  const dbInitOptions = { token: accessToken }
  if (params.region) {
    dbInitOptions.region = params.region
  }
  const dbBase = await libDb.init(dbInitOptions)
  const db = await dbBase.connect()

  if (operation === 'db.listCollections') {
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
}

async function handleStateOperation (params, operation) {
  const state = await libState.init()

  if (operation === 'state.list') {
    const match = (params.match && typeof params.match === 'string' && params.match.trim()) ? params.match.trim() : '*'
    const keys = []
    for await (const page of state.list({ match })) {
      if (Array.isArray(page.keys)) {
        keys.push(...page.keys)
      }
      if (keys.length >= 2000) {
        break
      }
    }
    keys.sort()
    return {
      statusCode: 200,
      ok: true,
      body: {
        count: keys.length,
        match,
        namespace: process.env.__OW_NAMESPACE || null,
        region: null,
        keys
      }
    }
  }

  if (operation === 'state.get') {
    const key = params.key.trim()
    const data = await state.get(key)
    const exists = !!data
    return {
      statusCode: 200,
      ok: true,
      body: {
        key,
        exists,
        value: exists ? data.value : null,
        expiration: exists ? data.expiration : null
      }
    }
  }

  throw new Error(`unsupported state operation: ${operation}`)
}

async function handleFilesOperation (params, operation) {
  const files = await libFiles.init()

  if (operation === 'files.list') {
    const prefix = (params.prefix && typeof params.prefix === 'string' && params.prefix.trim()) ? params.prefix.trim() : '/'
    const items = await files.list(prefix)
    const list = Array.isArray(items) ? items : []
    list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    return {
      statusCode: 200,
      ok: true,
      body: {
        prefix,
        count: list.length,
        items: list
      }
    }
  }

  if (operation === 'files.getProperties') {
    const filePath = params.filePath.trim()
    const details = await files.getProperties(filePath)
    return {
      statusCode: 200,
      ok: true,
      body: {
        filePath,
        details
      }
    }
  }

  throw new Error(`unsupported files operation: ${operation}`)
}

exports.main = main
