# FORKED FROM https://github.com/henhal/serverless-plugin-layer-manager

# serverless-plugin-layer-manager

[![NPM version](https://img.shields.io/npm/v/serverless-plugin-layer-manager.svg)](https://www.npmjs.com/package/serverless-plugin-layer-manager)
[![Build Status](https://travis-ci.com/henhal/serverless-plugin-layer-manager.svg?branch=master)](https://travis-ci.com/henhal/serverless-plugin-layer-manager)

Plugin for the Serverless framework that offers improved AWS Lambda layer management.

The Serverless framework supports AWS Lambda layers, but there are some shortcomings:

* When creating Node.JS layers from local directories you create a directory containing a `nodejs` folder with a `package.json` file in it. However, the Serverless framework will not automatically install the dependencies used by the layer, so it needs to be done manually using e.g. hooks.

* Layers are not exported by default. To export a layer you must declare your XxxLambdaLayer resources under `Output` and add an `Export` property manually

* If using `retain: true` on your layers, it's not possible to reference them from functions in the same stack, since layer names will be appended with a unique version hash. You either need to stop using `retain` or put your layers in a separate stack and export them using the trick above, and then reference them from your functions in another stack.

This plugin fixes all these problems by automatically adding hooks to invoke `npm install` on each declared Node.JS layer, and by transforming the generated CloudFormation template to export the layers and to properly reference the versioned layers from functions.

Installation:

```
npm install --save-dev serverless-plugin-layer-manager
```

serverless.yml:

```
...
plugins:
  - serverless-plugin-layer-manager
```

That's it! You may now reference your layers from functions in the same file like

```
# OPTIONAL: If you like to run the npm install command with --unsafe-perm flag .e.g "npm install --unsafe-perm"
# useful if you have a preinstall/postinstall script that needs to run as root
custom: 
  plugin:
    layerManager:
      NodeLayers:
        unSafePermissions: true

layers:
  lib:
    path: lib
    name: dev-foo-lib
    description: My library
    retain: true
    
functions:
  hello:
    handler: index.handler
    layers:
      # Note the reference being the TitleCase representation of the layer id followed by "LambdaLayer"
      - {Ref: LibLambdaLayer}
```

The `lib` layer will be installed and its `node_modules` packaged into the artifact, and the function will use the layer.

You may customize the features by adding a `layerConfig` object under `custom`, supporting the following properties:

```
custom:
  layerConfig:
    installLayers: <boolean>
    exportLayers: <boolean>
    upgradeLayerReferences: <boolean>
    exportPrefix: <prefix used for the names of the exported layers>
```

By default, all config options are true and the `exportPrefix` is set to `${AWS:StackName}-`.

NOTE: ⚠️ If your project is using Typescript, make sure to use built Js files to avoid issues using patterns finding ⚠️
