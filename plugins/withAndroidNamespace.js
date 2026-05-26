const { withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const APPLICATION_ID = 'com.do.simpletodo';
const ANDROID_NAMESPACE = 'com.dosimpletodo';

function withAndroidNamespace(config) {
  config = withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language === 'groovy') {
      gradleConfig.modResults.contents = gradleConfig.modResults.contents.replace(
        /namespace\s+['"][^'"]+['"]/,
        `namespace '${ANDROID_NAMESPACE}'`
      );
      gradleConfig.modResults.contents = gradleConfig.modResults.contents.replace(
        /applicationId\s+['"][^'"]+['"]/,
        `applicationId '${APPLICATION_ID}'`
      );
    }

    return gradleConfig;
  });

  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.platformProjectRoot;
      const invalidSourceDir = path.join(
        projectRoot,
        'app/src/main/java/com/do/simpletodo'
      );
      const validSourceDir = path.join(
        projectRoot,
        'app/src/main/java/com/dosimpletodo'
      );

      if (!fs.existsSync(invalidSourceDir)) {
        return modConfig;
      }

      fs.mkdirSync(validSourceDir, { recursive: true });

      for (const fileName of fs.readdirSync(invalidSourceDir)) {
        if (!fileName.endsWith('.kt')) continue;

        const sourcePath = path.join(invalidSourceDir, fileName);
        const contents = fs.readFileSync(sourcePath, 'utf8').replace(
          /^package com\.do\.simpletodo/m,
          `package ${ANDROID_NAMESPACE}`
        );

        fs.writeFileSync(path.join(validSourceDir, fileName), contents);
      }

      fs.rmSync(invalidSourceDir, { recursive: true, force: true });

      const invalidDoDir = path.join(projectRoot, 'app/src/main/java/com/do');
      if (fs.existsSync(invalidDoDir)) {
        fs.rmSync(invalidDoDir, { recursive: true, force: true });
      }

      return modConfig;
    },
  ]);

  return config;
}

module.exports = withAndroidNamespace;
