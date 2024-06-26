import assert from 'assert'
import path from 'path'
import * as url from 'url'
import iriResolve from 'rdf-loader-code/lib/iriResolve.js'
import sinon from 'sinon'
import esmock from 'esmock'
import * as parser from '../lib/parser.js'
import ChecksCollection from '../lib/checksCollection.js'
import * as validators from '../lib/validators/index.js'
import { turtleToCF, genericContainsMessage, checkArrayContainsObject } from './helpers.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

class ClownfaceMock {
  namedNode() {
    return null
  }

  has() {
    return null
  }

  in() {
    return null
  }

  out() {
    return null
  }

  list() {
    return null
  }
}

function generateGraphMock() {
  const pizzaSteps = sinon.createStubInstance(ClownfaceMock, {
    out: sinon.stub().returnsThis(),
  })
  pizzaSteps.term = { value: null }
  const steps = [
    'operation1',
    'Turn on the oven',
    '1',
    'operation2',
    'Put there frozen pizza',
    '2',
    'operation3',
    'Wait 30 min',
    '3',
    'operation4',
    'Enjoy!',
    '4',
  ]
  sinon.stub(pizzaSteps, 'term').get(function getterFn() {
    return { value: steps.shift() }
  })

  const pancakeSteps = sinon.createStubInstance(ClownfaceMock, {
    out: sinon.stub().returnsThis(),
  })
  pancakeSteps.term = { value: null }
  const steps2 = [
    'operation1',
    'Find a French chef',
    '11',
    'operation2',
    'Ask them to make you pancakes',
    '12',
  ]
  sinon.stub(pancakeSteps, 'term').get(function getterFn() {
    return { value: steps2.shift() }
  })

  const pancakesPipeline = sinon.createStubInstance(ClownfaceMock, {
    out: sinon.stub().returnsThis(),
    list: [pancakeSteps, pancakeSteps],
  })
  pancakesPipeline.term = { value: 'pancakes' }

  const pizzaPipeline = sinon.createStubInstance(ClownfaceMock, {
    out: sinon.stub().returnsThis(),
    list: [pizzaSteps, pizzaSteps, pizzaSteps, pizzaSteps],
  })
  pizzaPipeline.term = { value: 'pizza' }

  const graph = sinon.createStubInstance(ClownfaceMock, {
    has: [pizzaPipeline, pancakesPipeline],
  })
  return graph
}

describe('parser', () => {
  let checks
  beforeEach(async () => {
    checks = new ChecksCollection()
  })

  describe('getDependencies', () => {
    it('should create tree structure for codelinks', () => {
      const input = [
        { stepName: 'a', stepOperation: 'node:barnard59-base#fetch.json' },
        { stepName: 'b', stepOperation: 'node:barnard59-base#map' },
        { stepName: 'c', stepOperation: 'node:barnard59-formats#ntriples.serialize' },
        { stepName: 'd', stepOperation: 'file:awesomeModule#awesomeFunction' },
      ]
      const expected = {
        'node:': {
          'barnard59-base': new Set(['node:barnard59-base#fetch.json', 'node:barnard59-base#map']),
          'barnard59-formats': new Set(['node:barnard59-formats#ntriples.serialize']),
        },
        'file:': {
          [path.join(process.cwd(), 'awesomeModule')]: new Set(['file:awesomeModule#awesomeFunction']),
        },
      }
      const actual = parser.getDependencies(input, process.cwd())
      assert.deepStrictEqual(expected, actual)
    })

    it('should fail with noniterable input', () => {
      const input = 'node:barnard59-base#fetch.json'
      assert.throws(() => parser.getDependencies(input), TypeError)
    })

    it('should forward iriResolve error', () => {
      const input = [{ stepOperation: 'abc' }]
      try {
        iriResolve(input[0].stepOperation, process.cwd())
        assert.fail('The input is invalid')
      } catch (expectedError) {
        assert.throws(() => parser.getDependencies(input), expectedError)
      }
    })
  })

  describe('getAllCodeLinks', () => {
    it('should transform dict values to set', () => {
      const input = {
        pancakes: ['flour', 'eggs', 'milk', 'olive oil'],
        brioche: ['flour', 'milk', 'butter', 'yeast'],
      }
      const expected = new Set(['flour', 'eggs', 'milk', 'olive oil', 'butter', 'yeast'])
      const actual = parser.getAllCodeLinks(input)
      assert.deepStrictEqual(expected, actual)
    })
  })

  describe('readGraph', () => {
    it('should read .ttl file and create DatasetCore object', async () => {
      const input = path.join(__dirname, 'fixtures/example.ttl')
      const graph = await parser.readGraph(input, new ChecksCollection())

      assert.strictEqual(graph.dataset.size, 4)
    })
  })

  describe('getModuleOperationProperties', () => {
  // Mock input properties
    const ids = ['Christian Andersen', 'Johnny Bravo', 'Pikachu']
    const andersenNodes = [{
      term: {
        value: 'prefix/writer',
      },
    },
    {
      term: {
        value: 'prefix/Dannish',
      },
    }]
    const bravoNodes = [{
      term: {
        value: 'prefix/narcissist',
      },
    },
    {
      term: {
        value: 'prefix/womanizer',
      },
    }]
    const picachuNodes = []

    const graph = sinon.createStubInstance(ClownfaceMock, {
      namedNode: sinon.stub().returnsThis(),
      in: sinon.stub().returnsThis(),
    })

    graph.out.onCall(0).returns(andersenNodes)
    graph.out.onCall(1).returns(bravoNodes)
    graph.out.onCall(2).returns(picachuNodes)

    it('should create properties tree for identifiers', () => {
      const actual = parser.getModuleOperationProperties(graph, ids)
      const expected = {
        'Christian Andersen': ['writer', 'Dannish'],
        'Johnny Bravo': ['narcissist', 'womanizer'],
        Pikachu: null,
      }
      assert.deepStrictEqual(actual, expected)
    })
  })

  describe('getIdentifiers', () => {
    it('should create pipelines list', () => {
      const input = generateGraphMock()
      const expected = {
        pizza: [
          { stepName: 'Turn on the oven', stepOperation: 'operation1' },
          { stepName: 'Put there frozen pizza', stepOperation: 'operation2' },
          { stepName: 'Wait 30 min', stepOperation: 'operation3' },
          { stepName: 'Enjoy!', stepOperation: 'operation4' },
        ],
        pancakes: [
          { stepName: 'Find a French chef', stepOperation: 'operation1' },
          { stepName: 'Ask them to make you pancakes', stepOperation: 'operation2' },
        ],
      }

      const actual = parser.getIdentifiers(input, checks)
      assert.deepStrictEqual(actual, expected)
    })

    it('should return only requested pipeline', () => {
      const input = generateGraphMock()
      const expected = {
        pancakes: [
          { stepName: 'Find a French chef', stepOperation: 'operation1' },
          { stepName: 'Ask them to make you pancakes', stepOperation: 'operation2' },
        ],
      }
      const actual = parser.getIdentifiers(input, checks, 'pancakes')
      assert.deepStrictEqual(actual, expected)
    })

    it('should return empty dict if pipeline does not exist', () => {
      const input = generateGraphMock()
      const expected = {}
      const actual = parser.getIdentifiers(input, checks, 'inexistentPipeline')
      assert.deepStrictEqual(actual, expected)
    })

    it('should not crash on invalid steps', async () => {
      const input = await turtleToCF(`
      @prefix p: <https://pipeline.described.at/> .

      <mainCreateFile> a p:Pipeline, p:Readable;
        p:variables _:vars ;
        p:steps [
          p:stepList (<mainUpload>)
        ].

      <mainUpload> a p:Pipeline;
        p:variables _:vars ;
        p:steps [].
    `)

      const expected = {
        mainCreateFile: [],
        mainUpload: [],
      }
      const actual = parser.getIdentifiers(input, checks)
      assert.deepStrictEqual(actual, expected)

      const errors = checks.getPipelineChecks('mainCreateFile', ['error'])
      assert.strictEqual(errors.length, 1)
      const error = errors[0]
      assert.strictEqual(error.level, 'error')
      assert.strictEqual(error.message, validators.codelink.messageFailureTemplate())
      assert.strictEqual(error.step, 'mainUpload')
    })
  })

  describe('getAllOperationProperties', () => {
    it('should get operation properties from manifest.ttl file', async () => {
      const mockedParser = await esmock('../lib/parser.js', {
        '../lib/utils.js': {
          getManifestPath: sinon.stub().returns('test/fixtures/manifest.ttl'),
          isModuleInstalled: sinon.stub().returns(true),
        },
      })

      const input = {
        'node:': {
          sinon: new Set(['node:party-module#dance', 'node:party-module#drink']),
        },
      }
      const expected = {
        'node:party-module#dance': null,
        'node:party-module#drink': ['Operation', 'Writable', 'Readable'],
      }

      const actual = await mockedParser.getAllOperationProperties(input, checks)
      assert.deepStrictEqual(actual, expected)
    })

    it("should return nulls if manifest.ttl doesn't exist", async () => {
      const parser = await esmock('../lib/parser.js', {
        '../lib/utils.js': {
          getManifestPath: sinon.stub().returns(null),
        },
      })

      const input = {
        'node:': {
          sinon: new Set(['node:party-module#dance', 'node:party-module#drink']),
          mocha: new Set(['node:work-module#code', 'node:work-module#sleep']),
        },
      }

      const expected = {
        'node:party-module#dance': null,
        'node:party-module#drink': null,
        'node:work-module#code': null,
        'node:work-module#sleep': null,
      }

      const actual = await parser.getAllOperationProperties(input, checks)
      assert.deepStrictEqual(actual, expected)
    })

    it('should return properties for existing operations, and nulls for nonexisting ones', async () => {
      const parser = await esmock('../lib/parser.js', {
        '../lib/utils.js': {
          getManifestPath: sinon.stub().returns('test/fixtures/manifest.ttl'),
          isModuleInstalled: sinon.stub().returns(true),
        },
      })

      const input = {
        'node:': {
          sinon: new Set(['node:party-module#dance', 'node:party-module#drink']),
          mocha: new Set(['node:work-module#code', 'node:work-module#sleep']),
        },
      }

      const expected = {
        'node:party-module#dance': null,
        'node:party-module#drink': ['Operation', 'Writable', 'Readable'],
        'node:work-module#code': null,
        'node:work-module#sleep': null,
      }

      const actual = await parser.getAllOperationProperties(input, checks)
      assert.deepStrictEqual(actual, expected)
    })

    it('should report missing packages', async () => {
      const parser = await esmock('../lib/parser.js', {
        '../lib/utils.js': {
          isModuleInstalled: sinon.stub().returns(false),
        },
      })
      const input = {
        'node:': {
          'foo-bar': new Set(['node:foo-bar#fn']),
        },
      }

      const expected = {}
      const actual = await parser.getAllOperationProperties(input, checks)
      assert.deepStrictEqual(actual, expected)

      const expectedMssg = validators.dependency.messageFailureTemplate({ library: 'foo-bar', operations: 'node:foo-bar#fn', dependencyType: 'package' })
      assert(genericContainsMessage(checks, expectedMssg))
    })
  })

  describe('getPipelineProperties', () => {
    const pipeline = {
      term: {
        value: null,
      },
    }
    const pipelinesProperties = [
      'https://pipeline.described.at/Pipeline',
      'https://pipeline.described.at/Crunchy',
      'https://pipeline.described.at/Pipeline',
      'https://pipeline.described.at/Soft',

    ]
    sinon.stub(pipeline, 'term').get(function getterFn() {
      return { value: pipelinesProperties.shift() }
    })

    const graph = sinon.createStubInstance(ClownfaceMock, {
      namedNode: sinon.stub().returnsThis(),
    })

    const pipelinesIDs = ['pizza', 'pancakes']
    it('should extract pipeline properties', () => {
      graph.out.onCall(0).returns([pipeline, pipeline])
      graph.out.onCall(1).returns([pipeline, pipeline])

      const actual = parser.getPipelineProperties(graph, pipelinesIDs)
      const expected = {
        pizza: ['Pipeline', 'Crunchy'],
        pancakes: ['Pipeline', 'Soft'],
      }
      assert.deepStrictEqual(actual, expected)
    })
    it('should return null when no properties exist', () => {
      graph.out.onCall(2).returns([])
      graph.out.onCall(3).returns([])
      const actual = parser.getPipelineProperties(graph, pipelinesIDs)
      const expected = {
        pizza: null,
        pancakes: null,
      }
      assert.deepStrictEqual(actual, expected)
    })
  })

  describe('validatePipelines', () => {
    const pipelines = {
      pizza:
  [{ stepOperation: 'Turn on the oven' },
    { stepOperation: 'Put there frozen pizza' },
    { stepOperation: 'Wait 30 min' },
    { stepOperation: 'Enjoy!' }],
      pancakes:
  [{ stepOperation: 'Find a French chef' },
    { stepOperation: 'Ask them to make you pancakes' }],
    }
    const operation2properties = {
      'Find a French chef': ['quickly'],
      'Ask them to make you pancakes': null,
      'Turn on the oven': null,
      'Put there frozen pizza': null,
      'Wait 30 min': null,
      'Enjoy!': ['with friends'],
    }
    const expectedPizzaIssue = validators.pipelinePropertiesExist.validate('pizza', [])
    const expectedPancakesIssue = validators.pipelinePropertiesExist.validate('pancakes', [])

    it('should issue a warning if pipeline has no readable/writable property', () => {
      const pipeline2properties = {
        pancakes: ['Pipeline'],
        pizza: ['Pipeline', 'crunchy'],
      }
      checks = new ChecksCollection()

      parser.validatePipelines(pipelines, operation2properties, pipeline2properties, checks)
      const actualPizzaIssues = checks.getPipelineChecks('pizza', 'warning')
      const actualPancakesIssues = checks.getPipelineChecks('pancakes', 'warning')

      assert(checkArrayContainsObject(actualPizzaIssues, expectedPizzaIssue))
      assert(checkArrayContainsObject(actualPancakesIssues, expectedPancakesIssue))
    })

    it('should issue an info if pipeline has readable/writable property', () => {
      const pipeline2properties = {
        pancakes: ['soft', 'Readable'],
        pizza: ['crunchy', 'Writable'],
      }

      for (const pipelineID of ['pizza', 'pancakes']) {
        checks = new ChecksCollection()

        const expectedIssue = validators.pipelinePropertiesExist.validate(pipelineID, ['Readable'])
        parser.validatePipelines({ [pipelineID]: pipelines[pipelineID] }, operation2properties, pipeline2properties, checks)
        assert(checkArrayContainsObject(checks.pipelines[pipelineID], expectedIssue))
      }
    })
  })
})
