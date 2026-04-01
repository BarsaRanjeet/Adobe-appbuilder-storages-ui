import React, { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Heading,
  ListView,
  ListViewItem,
  ProgressCircle,
  Text,
  TextField
} from '@react-spectrum/s2'
import allActions from '../config.json'
import actionWebInvoke from '../utils'

function getExplorerActionUrl () {
  const actionKey = Object.keys(allActions).find((key) => key.includes('db-explorer'))
  return actionKey ? allActions[actionKey] : null
}

function formatDoc (doc) {
  try {
    return JSON.stringify(doc, null, 2)
  } catch (e) {
    return String(doc)
  }
}

function EyeIcon () {
  return (
    <svg width='16' height='16' viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
      <path
        fill='currentColor'
        d='M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2.5A2.5 2.5 0 1 0 12 9a2.5 2.5 0 0 0 0 5.5Z'
      />
    </svg>
  )
}

function safeParseJSON (text) {
  if (!text || !text.trim()) {
    return { ok: true, value: {} }
  }
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (e) {
    return { ok: false, error: 'Query must be valid JSON.' }
  }
}

function normalizeQuery (query) {
  const q = (query && typeof query === 'object') ? { ...query } : {}
  const limit = Number.isInteger(q.limit) ? q.limit : 25
  const skip = Number.isInteger(q.skip) ? q.skip : 0
  return { ...q, limit, skip }
}

const DEFAULT_QUERY = '{"filter":{},"limit":25,"skip":0,"sort":{"_id":-1}}'

function getColumns (documents) {
  const keys = {}
  documents.forEach((doc) => {
    Object.keys(doc || {}).forEach((key) => {
      keys[key] = true
    })
  })

  const ordered = Object.keys(keys)
  if (ordered.includes('_id')) {
    return ['_id', ...ordered.filter((k) => k !== '_id')].slice(0, 8)
  }
  return ordered.slice(0, 8)
}

function toCellText (value) {
  if (value === null || value === undefined) {
    return ''
  }
  if (Array.isArray(value)) {
    return `Array(${value.length})`
  }
  if (typeof value === 'object') {
    return 'Object'
  }
  return String(value)
}

const STORAGE_TABS = {
  database: 'database',
  state: 'state',
  files: 'files'
}

function DatabaseExplorer (props) {
  const explorerActionUrl = useMemo(() => getExplorerActionUrl(), [])
  const [activeTab, setActiveTab] = useState(STORAGE_TABS.database)
  const [collection, setCollection] = useState(null)
  const [collections, setCollections] = useState([])
  const [queryInput, setQueryInput] = useState(DEFAULT_QUERY)
  const [limitInput, setLimitInput] = useState('25')
  const [sortFieldInput, setSortFieldInput] = useState('_id')
  const [sortDirection, setSortDirection] = useState('-1')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingCollections, setLoadingCollections] = useState(false)
  const [documents, setDocuments] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [status, setStatus] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [selectedField, setSelectedField] = useState(null)
  const [stateKeys, setStateKeys] = useState([])
  const [stateMatch, setStateMatch] = useState('*')
  const [stateKey, setStateKey] = useState('')
  const [stateValue, setStateValue] = useState('')
  const [stateLoading, setStateLoading] = useState(false)
  const [stateStatus, setStateStatus] = useState('Ready.')
  const [stateError, setStateError] = useState('')
  const [stateValueMeta, setStateValueMeta] = useState(null)
  const [filesPrefix, setFilesPrefix] = useState('/')
  const [filesItems, setFilesItems] = useState([])
  const [filesPath, setFilesPath] = useState('')
  const [filesDetails, setFilesDetails] = useState(null)
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesStatus, setFilesStatus] = useState('Ready.')
  const [filesError, setFilesError] = useState('')
  const collectionItems = useMemo(() => collections.map((name) => ({ id: name, name })), [collections])
  const columns = useMemo(() => getColumns(documents), [documents])
  const selectedDoc = selectedIndex !== null ? documents[selectedIndex] : null
  const selectedValue = (selectedDoc && selectedField) ? selectedDoc[selectedField] : null
  const parsedQuery = useMemo(() => {
    const parsed = safeParseJSON(queryInput)
    if (!parsed.ok) {
      return { ok: false, error: parsed.error, value: null }
    }
    return { ok: true, value: normalizeQuery(parsed.value) }
  }, [queryInput])

  useEffect(() => {
    loadCollections()
  }, [])

  useEffect(() => {
    if (activeTab === STORAGE_TABS.state) {
      loadStateKeys()
    }
    if (activeTab === STORAGE_TABS.files) {
      loadFilesList()
    }
  }, [activeTab])

  return (
    <div className='db-page'>
      <Heading level={1} UNSAFE_style={{ color: '#1a1a1a', marginBottom: '10px' }}>Storage Explorer</Heading>
      <div className='storage-tabs'>
        <button type='button' className={`storage-tab ${activeTab === STORAGE_TABS.database ? 'is-active' : ''}`} onClick={() => setActiveTab(STORAGE_TABS.database)}>
          Database
        </button>
        <button type='button' className={`storage-tab ${activeTab === STORAGE_TABS.state ? 'is-active' : ''}`} onClick={() => setActiveTab(STORAGE_TABS.state)}>
          State
        </button>
        <button type='button' className={`storage-tab ${activeTab === STORAGE_TABS.files ? 'is-active' : ''}`} onClick={() => setActiveTab(STORAGE_TABS.files)}>
          Files
        </button>
      </div>

      {activeTab === STORAGE_TABS.database && (
        <div className='db-explorer-layout'>
        <div className='db-explorer-sidebar'>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <Text UNSAFE_style={{ fontWeight: 600 }}>Collections</Text>
            <Button variant='secondary' fillStyle='outline' onPress={loadCollections} isDisabled={!explorerActionUrl || loadingCollections}>
              Refresh
            </Button>
          </div>
          <div className='db-collections-list'>
            <ListView
              aria-label='Collections'
              items={collectionItems}
              selectedKeys={collection ? [collection] : []}
              selectionMode='single'
              onSelectionChange={(keys) => {
                if (keys === 'all') {
                  return
                }
                const values = Array.from(keys)
                setCollection(values[0] ? String(values[0]) : null)
              }}
            >
              {(item) => <ListViewItem id={item.id}>{item.name}</ListViewItem>}
            </ListView>
          </div>
          <div style={{ marginTop: '8px', flexShrink: 0 }}>
            {loadingCollections && <ProgressCircle aria-label='collections-loading' isIndeterminate />}
          </div>
        </div>

        <div className='db-explorer-content'>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'end' }}>
            <TextField
              label='Collection'
              value={collection || ''}
              onChange={(value) => setCollection(value)}
              placeholder='Select or type a collection'
              UNSAFE_style={{ width: '50%' }}
            />
            <Button
              variant='secondary'
              fillStyle='outline'
              onPress={() => runExplorerQuery()}
              isDisabled={!explorerActionUrl || !collection || loading}
            >
              Find
            </Button>
            <Button
              variant='secondary'
              fillStyle='outline'
              onPress={() => resetQuery()}
            >
              Reset
            </Button>
            <TextField
              label='Limit'
              value={limitInput}
              onChange={setLimitInput}
              UNSAFE_style={{ width: '80px' }}
            />
            <TextField
              label='Sort by'
              value={sortFieldInput}
              onChange={setSortFieldInput}
              UNSAFE_style={{ width: '100px' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: '#444' }}>Order</span>
              <select
                value={sortDirection}
                onChange={(e) => setSortDirection(e.target.value)}
                style={{ height: '30px', border: '1px solid #cfcfcf', borderRadius: '6px', padding: '0 8px', background: '#fff' }}
              >
                <option value='-1'>Desc</option>
                <option value='1'>Asc</option>
              </select>
            </div>
            {loading && <ProgressCircle aria-label='query-loading' isIndeterminate />}
          </div>

          <TextField
            label='Query (JSON)'
            value={queryInput}
            onChange={setQueryInput}
            placeholder='{"filter": {}, "limit": 25, "skip": 0, "sort": {"_id": -1}}'
            description='Mongo-style options: filter, projection, sort, limit, skip.'
            UNSAFE_style={{ marginBottom: '10px' }}
          />

          <div className='db-results-meta'>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <Text>
                Showing {documents.length}{totalCount ? ` of ${totalCount}` : ''} documents
              </Text>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant='secondary'
                  fillStyle='outline'
                  isDisabled={!parsedQuery.ok || !parsedQuery.value || parsedQuery.value.skip <= 0 || loading}
                  onPress={() => paginate(-1)}
                >
                  Prev
                </Button>
                <Button
                  variant='secondary'
                  fillStyle='outline'
                  isDisabled={!parsedQuery.ok || !parsedQuery.value || (totalCount ? (parsedQuery.value.skip + documents.length >= totalCount) : (documents.length === 0)) || loading}
                  onPress={() => paginate(1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>

          <div className={`db-query-status ${error ? 'is-error' : 'is-info'}`}>
            {error
              ? <Text UNSAFE_style={{ fontSize: '12px' }}>{error}</Text>
              : <Text UNSAFE_style={{ fontSize: '12px' }}>{status || 'Ready.'}</Text>}
          </div>

          <div className={`db-results-wrap ${documents.length > 0 ? 'has-data' : 'is-empty'}`}>
            {documents.length > 0
              ? (
                <div className='db-results-split'>
                  <div className='db-results-tableWrap'>
                    <table className='db-results-table'>
                      <thead>
                        <tr>
                          {columns.map((col) => (
                            <th key={col}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {documents.map((doc, index) => {
                          const isSelected = index === selectedIndex
                          return (
                            <tr
                              key={doc._id || index}
                              className={isSelected ? 'is-selected' : ''}
                              onClick={() => {
                                setSelectedIndex(index)
                                setSelectedField(null)
                              }}
                              role='button'
                              tabIndex={0}
                            >
                              {columns.map((col) => {
                                const value = doc ? doc[col] : undefined
                                const isComplex = value !== null && value !== undefined && typeof value === 'object'
                                return (
                                  <td key={`${doc._id || index}-${col}`}>
                                    <div className='db-cell'>
                                      <span className='db-cell-value'>{toCellText(value)}</span>
                                      {isComplex && (
                                        <button
                                          type='button'
                                          className='db-cell-iconBtn'
                                          onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            setSelectedIndex(index)
                                            setSelectedField(col)
                                          }}
                                          aria-label={`View ${col}`}
                                          title={`View ${col}`}
                                        >
                                          <EyeIcon />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className='db-details'>
                    <div className='db-details-header'>
                      <Text UNSAFE_style={{ fontWeight: 600 }}>
                        {selectedField ? `Field: ${selectedField}` : 'Document details'}
                      </Text>
                      <Button
                        variant='secondary'
                        fillStyle='outline'
                        isDisabled={selectedIndex === null}
                        onPress={() => {
                          setSelectedIndex(null)
                          setSelectedField(null)
                        }}
                      >
                        Clear
                      </Button>
                    </div>
                    {selectedDoc
                      ? (
                        selectedField
                          ? (
                            <div className='db-details-body'>
                              <div className='db-details-actions'>
                                <button
                                  type='button'
                                  className='db-cell-view'
                                  onClick={() => setSelectedField(null)}
                                >
                                  Back to document
                                </button>
                              </div>
                              <pre className='db-details-json'>{formatDoc(selectedValue)}</pre>
                            </div>
                            )
                          : <pre className='db-details-json'>{formatDoc(selectedDoc)}</pre>
                        )
                      : <Text>Select a row to see full JSON.</Text>}
                  </div>
                </div>
                )
              : <Text>No documents loaded. Click Find to fetch data.</Text>}
          </div>
        </div>
        </div>
      )}

      {activeTab === STORAGE_TABS.state && (
        <div className='db-explorer-layout'>
          <div className='db-explorer-sidebar'>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <Text UNSAFE_style={{ fontWeight: 600 }}>Keys</Text>
              <Button variant='secondary' fillStyle='outline' onPress={loadStateKeys} isDisabled={!explorerActionUrl || stateLoading}>
                Refresh
              </Button>
            </div>
            <TextField
              label='Match'
              value={stateMatch}
              onChange={setStateMatch}
              placeholder='*'
              UNSAFE_style={{ marginBottom: '8px' }}
            />
            <div className='db-collections-list'>
              <ListView
                aria-label='State Keys'
                items={stateKeys.map((key) => ({ id: key, key }))}
                selectedKeys={stateKey ? [stateKey] : []}
                selectionMode='single'
                onSelectionChange={(keys) => {
                  if (keys === 'all') {
                    return
                  }
                  const values = Array.from(keys)
                  const nextKey = values[0] ? String(values[0]) : ''
                  setStateKey(nextKey)
                  if (nextKey) {
                    getStateValue(nextKey)
                  }
                }}
              >
                {(item) => <ListViewItem id={item.id}>{item.key}</ListViewItem>}
              </ListView>
            </div>
          </div>

          <div className='db-explorer-content'>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'end' }}>
              <TextField
                label='Key'
                value={stateKey}
                onChange={setStateKey}
                placeholder='Enter key'
                UNSAFE_style={{ width: '50%' }}
              />
              <Button variant='secondary' fillStyle='outline' onPress={() => getStateValue(stateKey)} isDisabled={!stateKey.trim() || stateLoading}>
                Get
              </Button>
              {stateLoading && <ProgressCircle aria-label='state-loading' isIndeterminate />}
            </div>

            <TextField
              label='Value'
              value={stateValue}
              isReadOnly
              placeholder='Select a key and click Get'
              description='Read-only view of state value.'
              UNSAFE_style={{ marginBottom: '10px' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <Button
                variant='secondary'
                fillStyle='outline'
                onPress={() => {
                  setStateValue('')
                  setStateValueMeta(null)
                  setStateError('')
                  setStateStatus('Ready.')
                }}
              >
                Clear
              </Button>
            </div>

            <div className={`db-query-status ${stateError ? 'is-error' : 'is-info'}`}>
              {stateError
                ? <Text UNSAFE_style={{ fontSize: '12px' }}>{stateError}</Text>
                : <Text UNSAFE_style={{ fontSize: '12px' }}>{stateStatus}</Text>}
            </div>

            <div className='db-results-wrap has-data'>
              <div className='db-details' style={{ height: '100%' }}>
                <div className='db-details-header'>
                  <Text UNSAFE_style={{ fontWeight: 600 }}>Key details</Text>
                </div>
                <pre className='db-details-json'>
                  {formatDoc({
                    key: stateKey || null,
                    expiration: stateValueMeta?.expiration || null,
                    exists: stateValueMeta?.exists ?? null,
                    value: stateValue
                  })}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === STORAGE_TABS.files && (
        <div className='db-explorer-layout'>
          <div className='db-explorer-sidebar'>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <Text UNSAFE_style={{ fontWeight: 600 }}>Files</Text>
              <Button variant='secondary' fillStyle='outline' onPress={loadFilesList} isDisabled={filesLoading}>
                Refresh
              </Button>
            </div>
            <TextField
              label='Prefix'
              value={filesPrefix}
              onChange={setFilesPrefix}
              placeholder='/'
              UNSAFE_style={{ marginBottom: '8px' }}
            />
            <Button variant='secondary' fillStyle='outline' onPress={loadFilesList} isDisabled={filesLoading} UNSAFE_style={{ marginBottom: '8px' }}>
              List
            </Button>
            <div className='db-collections-list'>
              <ListView
                aria-label='Files'
                items={filesItems.map((item) => ({ id: item.name, name: item.name }))}
                selectedKeys={filesPath ? [filesPath] : []}
                selectionMode='single'
                onSelectionChange={(keys) => {
                  if (keys === 'all') {
                    return
                  }
                  const values = Array.from(keys)
                  const nextPath = values[0] ? String(values[0]) : ''
                  setFilesPath(nextPath)
                  if (nextPath) {
                    loadFileDetails(nextPath)
                  }
                }}
              >
                {(item) => <ListViewItem id={item.id}>{item.name}</ListViewItem>}
              </ListView>
            </div>
          </div>

          <div className='db-explorer-content'>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'end' }}>
              <TextField
                label='Path'
                value={filesPath}
                onChange={setFilesPath}
                placeholder='public/my-file.txt'
                UNSAFE_style={{ width: '60%' }}
              />
              <Button variant='secondary' fillStyle='outline' onPress={() => loadFileDetails(filesPath)} isDisabled={!filesPath.trim() || filesLoading}>
                Get metadata
              </Button>
              {filesLoading && <ProgressCircle aria-label='files-loading' isIndeterminate />}
            </div>

            <div className={`db-query-status ${filesError ? 'is-error' : 'is-info'}`}>
              {filesError
                ? <Text UNSAFE_style={{ fontSize: '12px' }}>{filesError}</Text>
                : <Text UNSAFE_style={{ fontSize: '12px' }}>{filesStatus}</Text>}
            </div>

            <div className='db-results-wrap has-data'>
              <div className='db-details' style={{ height: '100%' }}>
                <div className='db-details-header'>
                  <Text UNSAFE_style={{ fontWeight: 600 }}>File details</Text>
                </div>
                <pre className='db-details-json'>
                  {formatDoc(filesDetails || { path: filesPath || null })}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )

  async function runExplorerQuery (queryOverride) {
    if (!explorerActionUrl) {
      setError('db-explorer action URL not found. Run/deploy app so config actions are generated.')
      return
    }

    const parsed = safeParseJSON(queryOverride || queryInput)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    const normalized = applyFindControls(normalizeQuery(parsed.value))

    setLoading(true)
    setError('')
    setStatus('Running query…')
    const params = {
      collection: collection.trim(),
      operation: 'db.find',
      query: normalized
    }

    try {
      const headers = {}
      if (props.ims?.token) {
        headers.authorization = `Bearer ${props.ims.token}`
      }
      if (props.ims?.org) {
        headers['x-gw-ims-org-id'] = props.ims.org
      }

      const response = await actionWebInvoke(explorerActionUrl, headers, params)
      const docs = response?.body?.documents || response?.documents || []
      setDocuments(Array.isArray(docs) ? docs : [])
      setTotalCount(response?.body?.totalCount || response?.totalCount || 0)
      setQueryInput(JSON.stringify(normalized))
      setStatus('Query completed.')
      setSelectedIndex(null)
      setSelectedField(null)
    } catch (e) {
      setError(e.message || 'Query failed.')
      setStatus('')
      setTotalCount(0)
      setSelectedIndex(null)
      setSelectedField(null)
    } finally {
      setLoading(false)
    }
  }

  function paginate (direction) {
    if (!parsedQuery.ok || !parsedQuery.value) {
      return
    }
    const controlled = applyFindControls(parsedQuery.value)
    const { limit, skip, ...rest } = controlled
    const nextSkip = Math.max(0, skip + (direction > 0 ? limit : -limit))
    const nextQuery = { ...rest, limit, skip: nextSkip }
    const nextQueryStr = JSON.stringify(nextQuery)
    setQueryInput(nextQueryStr)
    runExplorerQuery(nextQueryStr)
  }

  function applyFindControls (query) {
    const next = { ...query }
    const parsedLimit = Number.parseInt(limitInput, 10)
    if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
      next.limit = parsedLimit
    }

    const field = (sortFieldInput || '').trim()
    if (field) {
      next.sort = { [field]: sortDirection === '1' ? 1 : -1 }
    }
    return next
  }

  function resetQuery () {
    setQueryInput(DEFAULT_QUERY)
    setLimitInput('25')
    setSortFieldInput('_id')
    setSortDirection('-1')
    setSelectedIndex(null)
    setSelectedField(null)
    setError('')
    setStatus('Ready.')
  }

  async function loadCollections () {
    if (!explorerActionUrl) {
      return
    }
    setLoadingCollections(true)
    try {
      const response = await actionWebInvoke(explorerActionUrl, {}, { operation: 'db.listCollections' })
      const names = response?.body?.collections || response?.collections || []
      setCollections(Array.isArray(names) ? names : [])
      if (Array.isArray(names) && names.length > 0 && !collection) {
        setCollection(names[0])
      }
    } catch (e) {
      setError(e.message || 'Failed to load collections.')
    } finally {
      setLoadingCollections(false)
    }
  }

  async function loadStateKeys () {
    if (!explorerActionUrl) {
      return
    }
    setStateLoading(true)
    setStateError('')
    setStateStatus('Loading keys…')
    try {
      const response = await actionWebInvoke(explorerActionUrl, {}, {
        operation: 'state.list',
        match: (stateMatch || '*').trim() || '*'
      })
      const body = response?.body || response || {}
      const keys = body.keys || []
      setStateKeys(Array.isArray(keys) ? keys : [])
      const count = Array.isArray(keys) ? keys.length : 0
      const namespace = body.namespace ? ` namespace: ${body.namespace}` : ''
      setStateStatus(`Loaded ${count} keys.${namespace}`)
    } catch (e) {
      setStateError(e.message || 'Failed to load state keys.')
      setStateStatus('')
    } finally {
      setStateLoading(false)
    }
  }

  async function getStateValue (keyInput) {
    const key = (keyInput || '').trim()
    if (!key || !explorerActionUrl) {
      return
    }
    setStateLoading(true)
    setStateError('')
    setStateStatus('Loading value…')
    try {
      const response = await actionWebInvoke(explorerActionUrl, {}, {
        operation: 'state.get',
        key
      })
      const body = response?.body || response || {}
      setStateKey(key)
      setStateValue(body.exists ? String(body.value || '') : '')
      setStateValueMeta({
        exists: !!body.exists,
        expiration: body.expiration || null
      })
      setStateStatus(body.exists ? 'Key loaded.' : 'Key not found.')
    } catch (e) {
      setStateError(e.message || 'Failed to get state key.')
      setStateStatus('')
    } finally {
      setStateLoading(false)
    }
  }

  async function loadFilesList () {
    if (!explorerActionUrl) {
      return
    }
    setFilesLoading(true)
    setFilesError('')
    setFilesStatus('Loading files…')
    try {
      const response = await actionWebInvoke(explorerActionUrl, {}, {
        operation: 'files.list',
        prefix: (filesPrefix || '/').trim() || '/'
      })
      const body = response?.body || response || {}
      const items = Array.isArray(body.items) ? body.items : []
      setFilesItems(items)
      setFilesStatus(`Loaded ${items.length} files from ${body.prefix || filesPrefix || '/'}.`)
      if (!filesPath && items.length > 0) {
        const first = items[0]?.name
        if (first) {
          setFilesPath(first)
        }
      }
    } catch (e) {
      setFilesError(e.message || 'Failed to list files.')
      setFilesStatus('')
    } finally {
      setFilesLoading(false)
    }
  }

  async function loadFileDetails (pathInput) {
    const nextPath = (pathInput || '').trim()
    if (!nextPath || !explorerActionUrl) {
      return
    }
    setFilesLoading(true)
    setFilesError('')
    setFilesStatus('Loading file metadata…')
    try {
      const response = await actionWebInvoke(explorerActionUrl, {}, {
        operation: 'files.getProperties',
        filePath: nextPath
      })
      const body = response?.body || response || {}
      setFilesPath(nextPath)
      setFilesDetails(body.details || null)
      setFilesStatus('File metadata loaded.')
    } catch (e) {
      setFilesError(e.message || 'Failed to load file metadata.')
      setFilesStatus('')
    } finally {
      setFilesLoading(false)
    }
  }

}

export default DatabaseExplorer
