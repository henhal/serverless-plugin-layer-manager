const {
  LOG_LEVEL = 'info'
} = process.env;

const {execSync} = require('child_process');
const pascalcase = require('pascalcase');
const fs = require('fs');

const DEFAULT_CONFIG = {
  installLayers: true,
  exportLayers: true,
  upgradeLayerReferences: true,
  exportPrefix: '${AWS::StackName}-'
};

const LEVELS = {
  none: 0,
  info: 1,
  verbose: 2
};

function log(...s) {
  console.log('[layer-manager]', ...s);
}

function verbose({level}, ...s) {
  LEVELS[level] >= LEVELS.verbose && log(...s);
}

function info({level}, ...s) {
  LEVELS[level] >= LEVELS.info && log(...s);
}

function getLayers(serverless) {
  return serverless.service.layers || {};
}

function getConfig(serverless) {
  const custom = serverless.service.custom || {};

  return {...DEFAULT_CONFIG, ...custom.layerConfig};
}

class LayerManagerPlugin {
  constructor(sls, options = {}) {
    this.level = options.v || options.verbose ? 'verbose' : LOG_LEVEL;

    info(this, `Invoking layer-manager plugin`);

    this.hooks = {
      'package:initialize': () => {
        this.init(sls);
        this.installLayers(sls)
      },
      'before:deploy:deploy': () => this.transformLayerResources(sls)
    };
  }

  init(sls) {
    this.config = getConfig(sls);
    verbose(this, `Config: `, this.config);
  }

  installLayer(path, custom) {
    const nodeLayerPath = `${path}/nodejs`;

    if (fs.existsSync(nodeLayerPath)) {
      const command = custom.unSafePermissions ? 'npm install --unsafe-perm' : 'npm install';
      verbose(this, `Installing nodejs layer ${path} using ${command}`);

      execSync(command, {
        stdio: 'inherit',
        cwd: nodeLayerPath
      });
      return true;
    }

    return false;
  }

  installLayers(sls) {
    const {installLayers} = this.config;

    if (!installLayers) {
      verbose(this, `Skipping installation of layers as per config`);
      return;
    }

    const layers = getLayers(sls);
    const installedLayers = Object.keys(layers)
      .filter((layerName) => {
        const config = layers[layerName];
        const {path} = config;
        const custom = this.getCustomByLayer(sls, layerName);

        return this.installLayer(path, custom);
      });

    info(this, `Installed ${installedLayers.length} layers`);

    return {installedLayers};
  }

  transformLayerResources(sls) {
    const {exportLayers, exportPrefix, upgradeLayerReferences} = this.config || DEFAULT_CONFIG;
    const layers = getLayers(sls);
    const {compiledCloudFormationTemplate: cf} = sls.service.provider;

    return Object.keys(layers).reduce((result, id) => {
      const name = pascalcase(id);
      const exportName = `${name}LambdaLayerQualifiedArn`;
      const output = cf.Outputs[exportName];

      if (!output) {
        return;
      }

      if (exportLayers) {
        output.Export = {
          Name: {
            'Fn::Sub': exportPrefix + exportName
          }
        };
        result.exportedLayers.push(output);
      }

      if (upgradeLayerReferences) {
        const resourceRef = `${name}LambdaLayer`;
        const versionedResourceRef = output.Value.Ref;

        if (resourceRef !== versionedResourceRef) {
          info(this, `Replacing references to ${resourceRef} with ${versionedResourceRef}`);

          Object.entries(cf.Resources)
            .forEach(([id, {Type: type, Properties: {Layers: layers = []} = {}}]) => {
              if (type === 'AWS::Lambda::Function') {
                layers.forEach(layer => {
                  if (layer.Ref === resourceRef) {
                    verbose(this, `${id}: Updating reference to layer version ${versionedResourceRef}`);
                    layer.Ref = versionedResourceRef;
                    result.upgradedLayerReferences.push(layer);
                  }
                })
              }
            });
        }
      }

      verbose(this, 'CF after transformation:\n', JSON.stringify(cf, null, 2));

      return result;
    }, {
      exportedLayers: [],
      upgradedLayerReferences: []
    });
  }

  getCustomByLayer(sls, layerName) {
    const layerManager = sls.service.custom?.plugin?.layerManager || {};
    return layerManager[layerName];
  }
}

module.exports = LayerManagerPlugin;