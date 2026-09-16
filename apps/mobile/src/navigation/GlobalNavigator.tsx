import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { useWindowDimensions } from 'react-native';
import { ModuleNavigator } from './ModuleNavigator';
import { TabletGlobalSidebar } from './TabletGlobalSidebar';
import {
  getModuleDefinition,
  MOBILE_MODULES,
  TABLET_BREAKPOINT,
  type ModuleKey,
  type RootDrawerParamList,
  type RootTabParamList,
} from './routes';

const Drawer = createDrawerNavigator<RootDrawerParamList>();
const Tabs = createBottomTabNavigator<RootTabParamList>();

type ModuleRouteProps = { route: { name: ModuleKey } };

function ModuleEntryRoute({ route }: ModuleRouteProps) {
  return <ModuleNavigator module={getModuleDefinition(route.name)} />;
}

function TabletGlobalNavigator() {
  return (
    <Drawer.Navigator drawerContent={(props) => <TabletGlobalSidebar {...props} />}>
      {MOBILE_MODULES.map((module) => (
        <Drawer.Screen
          key={module.key}
          name={module.key}
          component={ModuleEntryRoute}
          options={{ title: module.label }}
        />
      ))}
    </Drawer.Navigator>
  );
}

function SmallScreenGlobalNavigator() {
  return (
    <Tabs.Navigator screenOptions={{ headerShown: false }}>
      {MOBILE_MODULES.map((module) => (
        <Tabs.Screen
          key={module.key}
          name={module.key}
          component={ModuleEntryRoute}
          options={{ title: module.label }}
        />
      ))}
    </Tabs.Navigator>
  );
}

/** L1 global navigation: bottom tabs on phones, left drawer on tablets. */
export function GlobalNavigator() {
  const { width } = useWindowDimensions();
  return width >= TABLET_BREAKPOINT ? <TabletGlobalNavigator /> : <SmallScreenGlobalNavigator />;
}
