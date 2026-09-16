import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActiveWorkspaceScreen } from './ActiveWorkspaceScreen';
import { ContextPanelScreen } from './ContextPanelScreen';
import { SessionListScreen } from './SessionListScreen';
import type { ModuleStackParamList, ModuleDefinition } from './routes';

const Stack = createNativeStackNavigator<ModuleStackParamList>();
type SessionListRouteProps = NativeStackScreenProps<ModuleStackParamList, 'SessionList'>;
type ActiveWorkspaceRouteProps = NativeStackScreenProps<ModuleStackParamList, 'ActiveWorkspace'>;
type ContextPanelRouteProps = NativeStackScreenProps<ModuleStackParamList, 'ContextPanel'>;

function SessionListRoute(props: SessionListRouteProps) {
  return <SessionListScreen {...props} />;
}

function ActiveWorkspaceRoute(props: ActiveWorkspaceRouteProps) {
  return <ActiveWorkspaceScreen {...props} />;
}

function ContextPanelRoute(props: ContextPanelRouteProps) {
  return <ContextPanelScreen {...props} />;
}

export function ModuleNavigator({ module }: { module: ModuleDefinition }) {
  return (
    <Stack.Navigator initialRouteName="SessionList">
      <Stack.Screen
        name="SessionList"
        component={SessionListRoute}
        initialParams={{ moduleKey: module.key }}
        options={{ title: module.sessionLabel }}
      />
      <Stack.Screen
        name="ActiveWorkspace"
        component={ActiveWorkspaceRoute}
        options={{ title: module.workspaceLabel }}
      />
      <Stack.Screen
        name="ContextPanel"
        component={ContextPanelRoute}
        options={{
          title: module.contextLabel,
          presentation: 'modal',
          animation: 'slide_from_right',
        }}
      />
    </Stack.Navigator>
  );
}
