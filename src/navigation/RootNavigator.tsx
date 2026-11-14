import React from 'react';
import { StyleSheet } from 'react-native';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeScreen } from '../screens/HomeScreen';
import { BrowserScreen } from '../screens/BrowserScreen';
import { DownloadsScreen } from '../screens/DownloadsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import {
  DownloadIcon,
  GlobeIcon,
  HomeIcon,
  SettingsIcon,
} from '../components/Icons/BdmIcons';
import { useAppTheme } from '../hooks/useAppTheme';
import { useAppStore } from '../store/useAppStore';
import { RootTabParamList } from '../types';

const Tab = createBottomTabNavigator<RootTabParamList>();

export const RootNavigator: React.FC = () => {
  const { colors, isDark } = useAppTheme();
  const downloads = useAppStore((state) => state.downloads);
  const activeCount = downloads.filter(
    (d) => d.status === 'downloading' || d.status === 'pending',
  ).length;

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.textPrimary,
      border: colors.border,
      notification: colors.primary,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: [
            styles.tabBar,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
            },
          ],
          tabBarLabelStyle: styles.tabBarLabel,
        }}>
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarLabel: 'Home',
            tabBarIcon: ({ color, size }) => (
              <HomeIcon size={size ?? 20} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Browser"
          component={BrowserScreen}
          options={{
            tabBarLabel: 'Browser',
            tabBarIcon: ({ color, size }) => (
              <GlobeIcon size={size ?? 20} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Downloads"
          component={DownloadsScreen}
          options={{
            tabBarLabel: 'Downloads',
            tabBarBadge: activeCount > 0 ? activeCount : undefined,
            tabBarBadgeStyle: {
              backgroundColor: colors.primary,
              color: '#FFFFFF',
              fontSize: 10,
              fontWeight: '700',
            },
            tabBarIcon: ({ color, size }) => (
              <DownloadIcon size={size ?? 20} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarLabel: 'Settings',
            tabBarIcon: ({ color, size }) => (
              <SettingsIcon size={size ?? 20} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    height: 64,
    paddingTop: 6,
    paddingBottom: 8,
    borderTopWidth: 1,
    elevation: 8,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
