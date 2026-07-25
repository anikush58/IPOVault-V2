import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/sync/supabase';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';

WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  function handleNavigateBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/settings');
    }
  }

  async function signInWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      Alert.alert('Sign In Failed', error.message);
    } else {
      handleNavigateBack();
    }
    setLoading(false);
  }

  async function signUpWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      Alert.alert('Sign Up Failed', error.message);
    } else {
      Alert.alert('Success', 'Please check your inbox for email verification!');
      setIsLogin(true);
    }
    setLoading(false);
  }

  async function signInWithGoogle() {
    setLoading(true);
    const redirectTo = makeRedirectUri({
      scheme: 'ipovault',
    });

    console.log("========== GOOGLE OAUTH ==========");
    console.log("Redirect URI:", redirectTo);
    console.log("==================================");

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    console.log("OAuth URL:", data?.url);

    if (error) {
      Alert.alert('Google Sign-In Failed', error.message);
      setLoading(false);
      return;
    }
    
    if (data?.url) {
      try {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (res.type === 'success') {
          const { url } = res;
          
          const { params, errorCode } = QueryParams.getQueryParams(url);
          
          if (errorCode) throw new Error(errorCode);
          
          if (params?.code) {
             const { error } = await supabase.auth.exchangeCodeForSession(params.code);
             if (error) throw error;
             handleNavigateBack();
          } else if (params?.access_token && params?.refresh_token) {
             const { error } = await supabase.auth.setSession({
               access_token: params.access_token,
               refresh_token: params.refresh_token,
             });
             if (error) throw error;
             handleNavigateBack();
          } else {
             Alert.alert('Auth Error', 'No session code or tokens returned in authentication response.');
          }
        }
      } catch (err: any) {
        Alert.alert('Google Sign-In Failed', err?.message || 'Failed to open browser');
      }
    }
    setLoading(false);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.headerEyebrow, { color: colors.primary }]}>Account</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.inputContainer}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Email</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }
            ]}
            placeholder="you@example.com"
            placeholderTextColor={colors.mutedForeground}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Password</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }
            ]}
            placeholder="••••••••"
            placeholderTextColor={colors.mutedForeground}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={isLogin ? signInWithEmail : signUpWithEmail}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>{isLogin ? 'Sign In' : 'Sign Up'}</Text>
          )}
        </TouchableOpacity>

        <View style={styles.dividerContainer}>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>OR</Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
        </View>

        <TouchableOpacity
          style={[styles.googleButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={signInWithGoogle}
          disabled={loading}
        >
          <Feather name="globe" size={20} color={colors.foreground} style={styles.googleIcon} />
          <Text style={[styles.googleButtonText, { color: colors.foreground }]}>Continue with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toggleButton}
          onPress={() => setIsLogin(!isLogin)}
        >
          <Text style={[styles.toggleButtonText, { color: colors.primary }]}>
            {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerEyebrow: {
    fontSize: 11,
    fontFamily: 'DMSans_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 30,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    height: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  primaryButton: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  primaryButtonText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
    color: '#fff',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 30,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    marginHorizontal: 15,
  },
  googleButton: {
    flexDirection: 'row',
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIcon: {
    marginRight: 10,
  },
  googleButtonText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
  },
  toggleButton: {
    marginTop: 30,
    alignItems: 'center',
  },
  toggleButtonText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
  },
});
