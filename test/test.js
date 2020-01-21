const {expect} = require('chai');
const LayerManagerPlugin = require('../LayerManagerPlugin');

const DEFAULT_CONFIG = {
  exportLayers: true,
  exportPrefix: '${AWS::StackName}-',
  installLayers: true,
  upgradeLayerReferences: true
};

function createSls(layerConfig = {}) {
  return {
    service: {
      provider: {
        compiledCloudFormationTemplate: {
          "Resources": {
            "FooLambdaLayer3ed25b0e140bd1e41c1e324ac4792fd38d3757af": {
              "Type": "AWS::Lambda::LayerVersion",
              "Properties": {
                "LayerName": "Foo",
              },
              "DeletionPolicy": "Retain"
            },
            "BarLambdaLayer9d80ae7472d5ab9ca001e6a13cdca0aba66c372f": {
              "Type": "AWS::Lambda::LayerVersion",
              "Properties": {
                "LayerName": "Bar",
              },
              "DeletionPolicy": "Retain"
            },
            "HelloLambdaFunction": {
              "Type": "AWS::Lambda::Function",
              "Properties": {
                "FunctionName": "hello",
                "Layers": [
                  {
                    "Ref": "FooLambdaLayer"
                  }
                ]
              },
            },
          },
          "Outputs": {
            "FooLambdaLayerQualifiedArn": {
              "Value": {
                "Ref": "FooLambdaLayer3ed25b0e140bd1e41c1e324ac4792fd38d3757af"
              }
            },
            "BarLambdaLayerQualifiedArn": {
              "Value": {
                "Ref": "BarLambdaLayer9d80ae7472d5ab9ca001e6a13cdca0aba66c372f"
              }
            }
          }
        }
      },
      custom: {
        layerConfig
      },
      functions: {
        hello: {
          layers: [
            {
              Ref: 'FooLambdaLayer'
            }
          ]
        }
      },
      layers: {
        foo: {
          path: 'Foo',
        },
        bar: {
          path: 'Bar',
        }
      }
    }
  };
}

class Plugin extends LayerManagerPlugin {
  // Mock the install method
  installLayer(path) {
    return true;
  }
}

function createPlugin(sls, options) {
  const plugin = new Plugin(sls, options);
  plugin.init(sls);

  return plugin;
}

describe(`Plugin tests`, () => {
  it(`should create plugin with default config successfully`, async () => {
    const plugin = createPlugin(createSls());

    expect(plugin.config).to.eql(DEFAULT_CONFIG);
  });

  it(`should create plugin with custom config successfully`, async () => {
    const config = {
      exportLayers: false,
      exportPrefix: 'PREFIX',
      installLayers: false,
    };

    const plugin = createPlugin(createSls(config));

    expect(plugin.config).to.eql({
      ...DEFAULT_CONFIG,
      ...config,
    });
  });

  it('should set log level using -v or --verbose flag', () => {
    expect(createPlugin(createSls()).level).to.not.equal('verbose');
    expect(createPlugin(createSls(), {v: true}).level).to.equal('verbose');
    expect(createPlugin(createSls(), {verbose: true}).level).to.equal('verbose');
  });

  it(`should install layers successfully`, async () => {
    const sls = createSls();
    const plugin = createPlugin(sls);

    const {installedLayers} = plugin.installLayers(sls);
    expect(installedLayers).to.have.lengthOf(2);
  });

  it(`should export layers successfully`, async () => {
    const sls = createSls({exportLayers: true, upgradeLayerReferences: false});
    const plugin = createPlugin(sls);

    const {exportedLayers, upgradedLayerReferences} = plugin.transformLayerResources(sls);
    expect(exportedLayers).to.have.lengthOf(2);
    expect(upgradedLayerReferences).to.have.lengthOf(0);
  });

  it(`should upgrade versioned layer references successfully`, async () => {
    const sls = createSls({exportLayers: false, upgradeLayerReferences: true});
    const plugin = createPlugin(sls);

    const {exportedLayers, upgradedLayerReferences} = plugin.transformLayerResources(sls);
    expect(exportedLayers).to.have.lengthOf(0);
    expect(upgradedLayerReferences).to.have.lengthOf(1);
  });
});