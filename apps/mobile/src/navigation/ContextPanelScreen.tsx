import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { mobileColors } from '../theme/tokens';
import { getModuleDefinition } from './routes';
import type { ModuleStackParamList } from './routes';

type Props = NativeStackScreenProps<ModuleStackParamList, 'ContextPanel'>;

export function ContextPanelScreen({ navigation, route }: Props) {
  const module = getModuleDefinition(route.params.moduleKey);
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.eyebrow}>Context panel</Text>
      <Text style={styles.title}>{module.contextLabel}</Text>
      <Text style={styles.body}>
        This L4 surface is modal by design. Keep metadata and settings here so the L3 workspace stays focused.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Close ${module.contextLabel}`}
        onPress={() => navigation.goBack()}
        style={styles.button}
      >
        <Text style={styles.buttonLabel}>Close panel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 16, padding: 24, backgroundColor: mobileColors.surface },
  eyebrow: { fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: mobileColors.textSecondary },
  title: { fontSize: 28, fontWeight: '700', color: mobileColors.textPrimary },
  body: { fontSize: 16, lineHeight: 24, color: mobileColors.textBody },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: mobileColors.textPrimary },
  buttonLabel: { fontSize: 16, fontWeight: '700', color: mobileColors.surface },
});
