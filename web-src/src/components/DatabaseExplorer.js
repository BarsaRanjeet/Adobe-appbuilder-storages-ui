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

function DatabaseExplorer (props) {
  const explorerActionUrl = useMemo(() => getExplorerActionUrl(), [])
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
  const [resultCount, setResultCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [status, setStatus] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [selectedField, setSelectedField] = useState(null)
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

  return (
    <div className='db-page'>
      <Heading level={1} UNSAFE_style={{ color: '#1a1a1a', marginBottom: '10px' }}>Database Explorer</Heading>
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

    </div>
  )

  async function runExplorerQuery () {
    if (!explorerActionUrl) {
      setError('db-explorer action URL not found. Run/deploy app so config actions are generated.')
      return
    }

    const parsed = safeParseJSON(queryInput)
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
      setResultCount(response?.body?.count || response?.count || 0)
      setTotalCount(response?.body?.totalCount || response?.totalCount || 0)
      setQueryInput(JSON.stringify(normalized))
      setStatus('Query completed.')
      setSelectedIndex(null)
      setSelectedField(null)
    } catch (e) {
      setError(e.message || 'Query failed.')
      setStatus('')
      setResultCount(0)
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
    setQueryInput(JSON.stringify(nextQuery))
    setTimeout(() => runExplorerQuery(), 0)
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
      const response = await actionWebInvoke(explorerActionUrl, {}, { operation: 'listCollections' })
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
}

export default DatabaseExplorer
