const {execSync} = require('child_process');
const pascalcase = require('pascalcase');
const fs = require('fs');

const DEFAULT_CONFIG = {
  installLayers: true,
  exportLayers: true,
  upgradeLayerReferences: true,
  exportPrefix: '${AWS::StackName}-'
};

function getLayers(serverless) {
  return serverless.service.layers || {};
}

function getConfig(serverless) {
  const custom = serverless.service.custom || {};

  return {...DEFAULT_CONFIG, ...custom.layerConfig};
}

function log(...s) {
  console.log('[layer-manager]', ...s);
}

function verbose({level}, ...s) {
  level === 'verbose' && log(...s);
}

function info({level}, ...s) {
  log(...s);
}


class LayerManagerPlugin {
  constructor(sls, options = {}) {
    this.level = options.v || options.verbose ? 'verbose' : 'info';

    info(this, `Invoking layer-manager plugin`);

    this.hooks = {
      'package:initialize': () => this.installLayers(sls),
      'before:deploy:deploy': () => this.transformLayerResources(sls)
    };
  }

  installLayers(sls) {
    const config = getConfig(sls);

    if (!config.installLayers) {
      return;
    }

    const layers = getLayers(sls);
    let i = 0;
    Object.values(layers).forEach(({path}) => {
      const nodeLayerPath = `${path}/nodejs`;

      if (fs.existsSync(nodeLayerPath)) {
        verbose(this, `Installing nodejs layer ${path}`);
        execSync(`npm install --prefix ${nodeLayerPath}`, {
          stdio: 'inherit'
        });
        i++;
      }
    });

    info(this, `Installed ${i} layers`);
  }

  transformLayerResources(sls) {
    const config = getConfig(sls);
    const layers = getLayers(sls);
    const {compiledCloudFormationTemplate: cf} = sls.service.provider;

    Object.keys(layers).forEach(id => {
      const name = pascalcase(id);
      const exportName = `${name}LambdaLayerQualifiedArn`;
      const output = cf.Outputs[exportName];

      if (!output) {
        return;
      }

      if (config.exportLayers) {
        output.Export = {
          Name: {
            'Fn::Sub': config.exportPrefix + exportName
          }
        };
      }

      if (config.upgradeLayerReferences) {
        const resourceRef = `${name}LambdaLayer`;
        const versionedResourceRef = output.Value.Ref;

        if (resourceRef !== versionedResourceRef) {
          info(this, `Replacing references to ${resourceRef} with ${versionedResourceRef}`);

          Object.entries(cf.Resources)
            .forEach(([id, {Type, Properties: {Layers = []} = {}}]) => {
              if (Type === 'AWS::Lambda::Function') {
                Layers.forEach(Layer => {
                  if (Layer.Ref === resourceRef) {
                    verbose(this, `${id}: Updating reference to layer version ${versionedResourceRef}`);
                    Layer.Ref = versionedResourceRef;
                  }
                })
              }
            });
        }
      }

      verbose(this, 'CF after transformation:\n', JSON.stringify(cf, null, 2));
    });
  }
}

module.exports = LayerManagerPlugin;