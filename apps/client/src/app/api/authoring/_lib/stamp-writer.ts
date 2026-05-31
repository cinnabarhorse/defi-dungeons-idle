import * as ts from 'typescript';

import type {
  NormalizedAuthoringAsset,
  NormalizedStampPayload,
  Side,
} from './validation';

const SIDES: readonly Side[] = ['N', 'S', 'E', 'W'] as const;

const isPropertyNamed = (
  property: ts.ObjectLiteralElementLike,
  name: string
) => {
  if (
    !ts.isPropertyAssignment(property) &&
    !ts.isShorthandPropertyAssignment(property)
  ) {
    return false;
  }

  if (ts.isIdentifier(property.name)) {
    return property.name.text === name;
  }

  if (ts.isStringLiteral(property.name)) {
    return property.name.text === name;
  }

  return false;
};

const getObjectId = (
  literal: ts.ObjectLiteralExpression
): string | undefined => {
  for (const property of literal.properties) {
    if (!isPropertyNamed(property, 'id')) continue;
    if (!ts.isPropertyAssignment(property)) continue;
    if (ts.isStringLiteral(property.initializer)) {
      return property.initializer.text;
    }
  }
  return undefined;
};

const createStringLiteral = (text: string): ts.StringLiteral =>
  ts.factory.createStringLiteral(text, true);

const createBooleanLiteral = (value: boolean): ts.BooleanLiteral =>
  value ? ts.factory.createTrue() : ts.factory.createFalse();

const createNumericLiteral = (value: number): ts.NumericLiteral =>
  ts.factory.createNumericLiteral(
    Number.isInteger(value) ? value : value.toString()
  );

const createAssetLiteral = (
  asset: NormalizedAuthoringAsset
): ts.ObjectLiteralExpression => {
  const properties: ts.ObjectLiteralElementLike[] = [];

  if (asset.id) {
    properties.push(
      ts.factory.createPropertyAssignment('id', createStringLiteral(asset.id))
    );
  }

  if (asset.assetId) {
    properties.push(
      ts.factory.createPropertyAssignment(
        'assetId',
        createStringLiteral(asset.assetId)
      )
    );
  }

  properties.push(
    ts.factory.createPropertyAssignment('x', createNumericLiteral(asset.x))
  );
  properties.push(
    ts.factory.createPropertyAssignment('y', createNumericLiteral(asset.y))
  );

  properties.push(
    ts.factory.createPropertyAssignment(
      'sprite',
      createStringLiteral(asset.sprite)
    )
  );
  properties.push(
    ts.factory.createPropertyAssignment(
      'category',
      createStringLiteral(asset.category)
    )
  );

  if (typeof asset.allowOverlap === 'boolean') {
    properties.push(
      ts.factory.createPropertyAssignment(
        'allowOverlap',
        createBooleanLiteral(asset.allowOverlap)
      )
    );
  }

  if (typeof asset.rotation === 'number') {
    properties.push(
      ts.factory.createPropertyAssignment(
        'rotation',
        createNumericLiteral(asset.rotation)
      )
    );
  }

  if (asset.flipX) {
    properties.push(
      ts.factory.createPropertyAssignment('flipX', createBooleanLiteral(true))
    );
  }

  if (typeof asset.zIndex === 'number') {
    properties.push(
      ts.factory.createPropertyAssignment(
        'zIndex',
        createNumericLiteral(asset.zIndex)
      )
    );
  }

  return ts.factory.createObjectLiteralExpression(properties, true);
};

const createOrientationObject = (
  side: Side,
  payload: NormalizedStampPayload
): ts.PropertyAssignment => {
  const orientation = payload.oriented[side];
  const orientationProps: ts.ObjectLiteralElementLike[] = [];

  const assetLiterals = orientation.localAssets.map(createAssetLiteral);
  orientationProps.push(
    ts.factory.createPropertyAssignment(
      'localAssets',
      ts.factory.createArrayLiteralExpression(assetLiterals, true)
    )
  );

  if (orientation.footprint) {
    orientationProps.push(
      ts.factory.createPropertyAssignment(
        'footprint',
        ts.factory.createObjectLiteralExpression(
          [
            ts.factory.createPropertyAssignment(
              'width',
              createNumericLiteral(orientation.footprint.width)
            ),
            ts.factory.createPropertyAssignment(
              'height',
              createNumericLiteral(orientation.footprint.height)
            ),
          ],
          true
        )
      )
    );
  }

  return ts.factory.createPropertyAssignment(
    createStringLiteral(side),
    ts.factory.createObjectLiteralExpression(orientationProps, true)
  );
};

const updateOrientedProperty = (
  literal: ts.ObjectLiteralExpression,
  payload: NormalizedStampPayload
): ts.ObjectLiteralExpression => {
  const orientedProperty = ts.factory.createPropertyAssignment(
    'oriented',
    ts.factory.createObjectLiteralExpression(
      SIDES.map((side) => createOrientationObject(side, payload)),
      true
    )
  );

  let replaced = false;
  const properties = literal.properties.map((property) => {
    if (isPropertyNamed(property, 'oriented')) {
      replaced = true;
      return orientedProperty;
    }
    return property;
  });

  if (!replaced) {
    properties.push(orientedProperty);
  }

  return ts.factory.updateObjectLiteralExpression(literal, properties);
};

export const rewriteStampSource = (
  sourceText: string,
  payload: NormalizedStampPayload
): string => {
  const sourceFile = ts.createSourceFile(
    'port-stamps.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  let updated = false;

  const transformer =
    <T extends ts.Node>(context: ts.TransformationContext) =>
    (rootNode: T): T => {
      const visit = (node: ts.Node): ts.Node => {
        if (
          ts.isVariableDeclaration(node) &&
          node.initializer &&
          ts.isObjectLiteralExpression(node.initializer)
        ) {
          const initializer = node.initializer;
          const objectId = getObjectId(initializer);
          if (objectId === payload.id) {
            updated = true;
            const nextInitializer = updateOrientedProperty(
              initializer,
              payload
            );
            return ts.factory.updateVariableDeclaration(
              node,
              node.name,
              node.exclamationToken,
              node.type,
              nextInitializer
            );
          }
        }
        return ts.visitEachChild(node, visit, context);
      };

      return ts.visitEachChild(rootNode, visit, context);
    };

  const result = ts.transform(sourceFile, [transformer]);
  const transformed = result.transformed[0];
  result.dispose();

  if (!updated) {
    throw new Error(`Stamp with id "${payload.id}" was not found in source.`);
  }

  if (!ts.isSourceFile(transformed)) {
    throw new Error('Unexpected transformation output while updating stamp.');
  }

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const updatedText = printer.printFile(transformed);
  return updatedText.endsWith('\n') ? updatedText : `${updatedText}\n`;
};
