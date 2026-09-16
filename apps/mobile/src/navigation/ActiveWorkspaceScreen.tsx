import { useCallback, useState } from 'react';
import { Button, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ModuleStackParamList } from './routes';
import { getModuleDefinition } from './routes';
import { emitMockHardwareScan, useHardwareScanner } from '../hooks/useHardwareScanner';
import { mobileColors } from '../theme/tokens';
type Props = NativeStackScreenProps<ModuleStackParamList, 'ActiveWorkspace'>;

/** L3 touch workspace scaffold with the same event path as a native scanner. */
export function ActiveWorkspaceScreen({ navigation, route }: Props) {
  const module = getModuleDefinition(route.params.moduleKey);
  const [mockValue, setMockValue] = useState('BIN-42');
  const [lastScan, setLastScan] = useState<string | null>(null);
  const handleScan = useCallback((value: string) => setLastScan(value), []);
  useHardwareScanner(handleScan);

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.eyebrow}>Active workspace · L3</Text>
      <Text style={styles.title}>{module.workspaceLabel}</Text>
      <Text style={styles.session}>Session {route.params.sessionId ?? 'new'}</Text>

      <View style={styles.scanCard} accessibilityLiveRegion="polite">
        <Text style={styles.cardLabel}>Last scanner input</Text>
        <Text style={styles.scanValue}>{lastScan ?? 'Waiting for a scan'}</Text>
        <Text style={styles.help}>Native event: {'cycleforge.hardwareScanner.input'}</Text>
      </View>

      <TextInput
        accessibilityLabel="Mock scanner value"
        autoCapitalize="characters"
        onChangeText={setMockValue}
        onSubmitEditing={() => emitMockHardwareScan(mockValue)}
        returnKeyType="done"
        style={styles.input}
        value={mockValue}
      />
      <Button title="Emit mock scanner input" onPress={() => emitMockHardwareScan(mockValue)} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${module.contextLabel}`}
        onPress={() => navigation.navigate('ContextPanel', { moduleKey: module.key })}
        style={styles.contextButton}
      >
        <Text style={styles.contextButtonLabel}>Open {module.contextLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 16, padding: 20, backgroundColor: mobileColors.canvas },
  eyebrow: { fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: mobileColors.textSecondary },
  title: { fontSize: 28, fontWeight: '700', color: mobileColors.textPrimary },
  session: { fontSize: 15, color: mobileColors.textSoft },
  scanCard: { gap: 8, padding: 20, borderRadius: 12, backgroundColor: mobileColors.surface },
  cardLabel: { fontSize: 14, fontWeight: '600', color: mobileColors.textSecondary },
  scanValue: { fontSize: 24, fontWeight: '700', color: mobileColors.textPrimary },
  help: { fontSize: 13, color: mobileColors.textFaint },
  input: { minHeight: 48, paddingHorizontal: 14, borderWidth: 1, borderColor: mobileColors.border, borderRadius: 10, backgroundColor: mobileColors.surface, fontSize: 17, color: mobileColors.textPrimary },
  contextButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: mobileColors.accent },
  contextButtonLabel: { fontSize: 16, fontWeight: '700', color: mobileColors.surface },
});
