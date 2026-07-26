import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  GoogleSansFlex_400Regular,
  GoogleSansFlex_500Medium,
  GoogleSansFlex_600SemiBold,
  GoogleSansFlex_700Bold,
} from '@expo-google-fonts/google-sans-flex';
import { Feather } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { DBProvider } from '@/context/DBContext';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { DialogProvider } from '@/context/DialogContext';
import { setBaseUrl } from '@workspace/api-client-react';
import Constants from 'expo-constants';
import { FeatureFlags } from '@/constants/FeatureFlags';
import { useAutoSync } from '@/hooks/useAutoSync';
import { useIPOEngine } from '@/hooks/useIPOEngine';

// Configure the base URL for API requests dynamically
const apiDomain = process.env.EXPO_PUBLIC_DOMAIN;
let resolvedBaseUrl = 'http://localhost:8080';

if (apiDomain) {
  resolvedBaseUrl = `https://${apiDomain}`;
} else {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    resolvedBaseUrl = `http://${ip}:8080`;
  }
}
setBaseUrl(resolvedBaseUrl);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { resolvedScheme } = useTheme();
  useAutoSync();
  useIPOEngine();
  
  return (
    <>
      <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerBackTitle: 'Back' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="applications" options={{ headerShown: false }} />
        <Stack.Screen name="ipos" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        {FeatureFlags.ENABLE_AUTO_ALLOTMENT && (
          <Stack.Screen name="allotment-checker" options={{ headerShown: false }} />
        )}
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useFonts({
    DMSans_400Regular: GoogleSansFlex_400Regular,
    DMSans_500Medium: GoogleSansFlex_500Medium,
    DMSans_600SemiBold: GoogleSansFlex_600SemiBold,
    DMSans_700Bold: GoogleSansFlex_700Bold,
    PlayfairDisplay_700Bold: GoogleSansFlex_700Bold,
    ...Feather.font,
  });

  const ready = fontsLoaded || !!fontsError;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  // Always render — fonts snap in once loaded; fallback to system fonts if they fail.
  // Never block on null to avoid infinite blank screen.
  useEffect(() => {
    // Safety timeout: hide splash after 4s regardless of font state
    const t = setTimeout(() => SplashScreen.hideAsync(), 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ThemeProvider>
          <DialogProvider>
            <QueryClientProvider client={queryClient}>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <AuthProvider>
                  <DBProvider>
                    <RootLayoutNav />
                  </DBProvider>
                </AuthProvider>
              </GestureHandlerRootView>
            </QueryClientProvider>
          </DialogProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
