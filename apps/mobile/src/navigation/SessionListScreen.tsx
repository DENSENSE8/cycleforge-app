import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ModuleStackParamList } from './routes';
import { getModuleDefinition } from './routes';
import { mobileColors } from '../theme/tokens';
type Props = NativeStackScreenProps<ModuleStackParamList, 'SessionList'>;
const MOCK_SESSIONS = ['Next priority', 'Waiting on review', 'Recently updated'];

export function SessionListScreen({ navigation, route }: Props) {
  const module = getModuleDefinition(route.params.moduleKey);
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>{module.sessionLabel}</Text>
      <Text style={styles.subtitle}>L2 session queue · newest activity first</Text>
      <FlatList
        data={MOCK_SESSIONS}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item}, open ${module.workspaceLabel}`}
            onPress={() => navigation.navigate('ActiveWorkspace', { moduleKey: module.key, sessionId: `mock-${index + 1}` })}
            style={styles.row}
          >
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{item}</Text>
              <Text style={styles.rowMeta}>Session {index + 1} · ready</Text>
            </View>
            <Text accessible={false} style={styles.chevron}>›</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: mobileColors.canvas },
  title: { fontSize: 26, fontWeight: '700', color: mobileColors.textPrimary },
  subtitle: { marginTop: 6, fontSize: 15, color: mobileColors.textSecondary },
  list: { gap: 12, paddingTop: 20 },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 12, backgroundColor: mobileColors.surface },
  rowCopy: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 17, fontWeight: '600', color: mobileColors.textPrimary },
  rowMeta: { fontSize: 14, color: mobileColors.textSoft },
  chevron: { marginLeft: 12, fontSize: 28, color: mobileColors.textSoft },
});
