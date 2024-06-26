import { resolve } from 'path'
import * as url from 'url'
import rdf from '@zazuko/env'
import fromFile from 'rdf-utils-fs/fromFile.js'
import namespace from '@rdfjs/namespace'
import fromStream from 'rdf-dataset-ext/fromStream.js'
// eslint-disable-next-line import/no-extraneous-dependencies
import { desugar as desugarDefinition } from 'barnard59/lib/pipeline.js'

const ex = namespace('http://example.org/pipeline/')

export function pipelineDefinitionLoader(baseUrl, path = 'support/definitions') {
  const basePath = url.fileURLToPath(new URL('.', baseUrl))

  return async (name, { term = ex(''), logger, desugar = true } = {}) => {
    const filename = resolve(basePath, `${path}/${name}.ttl`)
    const stream = fromFile(filename)
    let dataset = await fromStream(rdf.dataset(), stream)
    if (desugar) {
      dataset = await desugarDefinition(dataset, { logger })
    }

    return rdf.clownface({ dataset, term })
  }
}
