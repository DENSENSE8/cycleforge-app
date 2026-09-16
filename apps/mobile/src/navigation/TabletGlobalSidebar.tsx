import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
  DrawerItem,
} from '@react-navigation/drawer';
import { StyleSheet, Text, View } from 'react-native';
import { mobileColors } from '../theme/tokens';
import { MOBILE_MODULES } from './routes';

type Props = DrawerContentComponentProps;

export function TabletGlobalSidebar({ navigation, state, ...props }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>CycleForge</Text>
        <Text style={styles.subtitle}>Warehouse operations</Text>
      </View>
      <DrawerContentScrollView {...props} contentContainerStyle={styles.list}>
        {MOBILE_MODULES.map((module, index) => (
          <DrawerItem
            key={module.key}
            label={module.label}
            focused={state.index === index}
            onPress={() => navigation.navigate(module.key)}
            labelStyle={styles.itemLabel}
          />
        ))}
      </DrawerContentScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mobileColors.surface },
  header: { gap: 4, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: '700', color: mobileColors.textPrimary },
  subtitle: { fontSize: 14, color: mobileColors.textSoft },
  list: { paddingTop: 8 },
  itemLabel: { fontSize: 16 },
});
