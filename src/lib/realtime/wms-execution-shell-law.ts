import ts from 'typescript';

export const WMS_EXECUTION_ROUTING_FILES = [
  'src/app/m/(shell)/pick/[orderId]/page.tsx',
  'src/app/m/(shell)/pick/[orderId]/_picker/useMobilePicker.ts',
  'src/app/m/(immersive)/p/[id]/photos/page.tsx',
  'src/components/mobile/packer/PackerScanReadyCamera.tsx',
  'src/components/mobile/packer/MobilePackingSheet.tsx',
  'src/components/mobile/packer/MobilePackingRow.tsx',
  'src/components/mobile/pair/MobilePairLocation.tsx',
  'src/components/mobile/pair/MobilePairQty.tsx',
] as const;

export const WMS_EXECUTION_ACTION_FILES = [
  'src/components/mobile/ConfirmDock.tsx',
  'src/components/mobile/picker/ShortPickSheet.tsx',
  'src/app/m/(shell)/pick/[orderId]/_picker/PickerShells.tsx',
  'src/components/mobile/pair/MobilePairLocation.tsx',
  'src/components/mobile/pair/MobilePairQty.tsx',
  'src/components/mobile/packer/MobilePackingSheet.tsx',
  'src/components/mobile/packer/MobilePackingRow.tsx',
  'src/components/mobile/photos/MobilePackerPhotoStudio.tsx',
  'src/components/mobile/station/MobilePackerSpamCamera.tsx',
] as const;

export type WmsExecutionShellViolation = {
  file: string;
  line: number;
  rule: 'legacy-routing' | 'motion-press-depth';
  message: string;
};

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function jsxAttribute(opening: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return opening.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText(opening.getSourceFile()) === name,
  );
}

function inspectRouting(file: string, text: string): WmsExecutionShellViolation[] {
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: WmsExecutionShellViolation[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier)
      && node.moduleSpecifier.text === 'next/link'
    ) {
      violations.push({
        file,
        line: lineOf(sourceFile, node),
        rule: 'legacy-routing',
        message: 'Execution workflows must not import next/link.',
      });
    }
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(sourceFile) === 'router'
      && node.expression.name.text === 'push'
    ) {
      violations.push({
        file,
        line: lineOf(sourceFile, node),
        rule: 'legacy-routing',
        message: 'Execution workflows must not call router.push().',
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

function inspectMotion(file: string, text: string): WmsExecutionShellViolation[] {
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: WmsExecutionShellViolation[] = [];
  const hasCanonicalButtonImport = /import\s+\{[^}]*\b(?:Button|IconButton)\b[^}]*\}\s+from\s+['"]@\/design-system\/primitives(?:\/Button)?['"]/.test(text);
  const rawTags = new Set(['button']);
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sourceFile);
      const isAction = jsxAttribute(node, 'onClick') || jsxAttribute(node, 'onPress');
      if (isAction && rawTags.has(tag)) {
        violations.push({
          file,
          line: lineOf(sourceFile, node),
          rule: 'motion-press-depth',
          message: `<${tag}> is an execution action outside the canonical design-system Button.`,
        });
      }
      if (isAction && tag === 'Button' && !hasCanonicalButtonImport) {
        violations.push({
          file,
          line: lineOf(sourceFile, node),
          rule: 'motion-press-depth',
          message: '<Button> must be imported from the canonical design-system primitive.',
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

export function evaluateWmsExecutionShell(
  sources: Readonly<Record<string, string>>,
): { ok: boolean; violations: WmsExecutionShellViolation[]; actionCount: number } {
  const violations = [
    ...WMS_EXECUTION_ROUTING_FILES.flatMap((file) => inspectRouting(file, sources[file] ?? '')),
    ...WMS_EXECUTION_ACTION_FILES.flatMap((file) => inspectMotion(file, sources[file] ?? '')),
  ];
  let actionCount = 0;
  for (const file of WMS_EXECUTION_ACTION_FILES) {
    const sourceFile = ts.createSourceFile(file, sources[file] ?? '', ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(sourceFile);
        if (
          ['Button', 'IconButton', 'motion.button', 'MotionButton', 'MotionIconButton'].includes(tag)
          && (jsxAttribute(node, 'onClick') || jsxAttribute(node, 'onPress'))
        ) actionCount += 1;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  if (actionCount === 0) {
    violations.push({
      file: 'WMS_EXECUTION_ACTION_FILES',
      line: 1,
      rule: 'motion-press-depth',
      message: 'Execution action cohort has no canonical Button actions.',
    });
  }
  return { ok: violations.length === 0, violations, actionCount };
}
