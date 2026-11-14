import React, { useEffect } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAppTheme } from './src/hooks/useAppTheme';
import { DownloadService } from './src/services/DownloadService';
import { useAppStore } from './src/store/useAppStore';

function ThemedRoot(): React.JSX.Element {
  const { colors } = useAppTheme();
  const applyNativeDownloadProgress = useAppStore(
    (state) => state.applyNativeDownloadProgress,
  );

  useEffect(() => {
    const unsubscribe = DownloadService.subscribeProgress((event) => {
      applyNativeDownloadProgress(event);
    });
    return unsubscribe;
  }, [applyNativeDownloadProgress]);

  return (
    <>
      <StatusBar
        barStyle={colors.statusBarStyle}
        backgroundColor={colors.background}
      />
      <RootNavigator />
    </>
  );
}

function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemedRoot />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export default App;
