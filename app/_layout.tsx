import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { AppProvider, useApp } from '../src/state/AppProvider';
import { C } from '../src/components/ui';
function Routes() {
  const { session, profile } = useApp();
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={!!session && !!profile?.active}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="equipment/[id]" />
          <Stack.Screen name="workflow" options={{ presentation: 'modal' }} />
          <Stack.Screen name="scanner" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="users" />
          <Stack.Screen name="chat/[id]" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
export default function Layout() {
  const [loaded, error] = useFonts({
    Prompt: require('../assets/fonts/Prompt-Regular.ttf'),
    PromptBold: require('../assets/fonts/Prompt-SemiBold.ttf'),
  });
  if (!loaded && !error)
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.green} />
      </View>
    );
  return (
    <AppProvider>
      <Routes />
    </AppProvider>
  );
}
