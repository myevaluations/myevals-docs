---
sidebar_position: 2
title: Getting Started
description: Developer setup guide for the MyEvaluations .NET MAUI app -- prerequisites, IDE setup, Android SDK, iOS requirements, and running the app locally.
---

# Getting Started

This guide walks you through setting up the MyEvaluations .NET MAUI mobile app (`myevals-xamarin-app`) for local development.

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Visual Studio 2022 | 17.8+ | With .NET MAUI workload installed |
| .NET SDK | 9.0 | Includes MAUI support |
| Android SDK | API 34 | Via Visual Studio or Android Studio |
| Android Emulator | -- | Or a physical Android device with USB debugging |
| Xcode | 15+ | **Mac only** -- required for iOS builds |
| Apple Developer Account | -- | For TestFlight distribution |
| Git | 2.x | For cloning the repository |
| VPN | -- | Required for backend API access |

## Step 1: Clone the Repository

```bash
git clone git@github.com:myevaluations/myevals-xamarin-app.git
cd myevals-xamarin-app
```

## Step 2: Install .NET MAUI Workload

If the MAUI workload is not already installed:

```bash
dotnet workload install maui
```

Or install it via the Visual Studio Installer by selecting the **.NET Multi-platform App UI development** workload.

## Step 3: Open in Visual Studio

1. Open `MyEvaluations.sln` in Visual Studio 2022
2. Wait for NuGet packages to restore automatically
3. Select your target platform (Android or iOS) from the toolbar

## Step 4: Configure Environment

The app reads configuration from build-time constants and environment-specific settings files:

- **Debug (Development)**: Points to the dev backend
- **Release (Production)**: Points to the production backend

Ensure the correct API base URLs are configured in the settings file:

```csharp
// Example: AppSettings.cs (or equivalent config file)
#if DEBUG
    public const string ApiBaseUrl = "https://api-dev.myevaluations.com";
#else
    public const string ApiBaseUrl = "https://api.myevaluations.com";
#endif
```

## Step 5: Run on Android

### Using an Emulator

1. Open the Android Device Manager in Visual Studio
2. Create or start an emulator (Pixel 5 API 34 recommended)
3. Select the emulator as the target device
4. Press **F5** (or **Ctrl+F5** for without debugging)

### Using a Physical Device

1. Enable **Developer Options** and **USB Debugging** on the device
2. Connect via USB
3. The device should appear in the target device dropdown
4. Press **F5** to build and deploy

## Step 6: Run on iOS (Mac Required)

iOS builds require a Mac, either local or connected via network:

### On a Mac

1. Open the solution in Visual Studio for Mac or use `dotnet build`
2. Select an iOS simulator or connected device
3. Press **F5**

### From Windows (Remote Mac)

1. In Visual Studio, go to **Tools > Options > Xamarin > iOS Settings**
2. Configure the connection to your Mac build host
3. Pair with the Mac
4. Select an iOS simulator and press **F5**

## Project Structure

```
myevals-xamarin-app/
├── MyEvaluations/
│   ├── Views/              # XAML pages
│   ├── ViewModels/         # MVVM ViewModels
│   ├── Models/             # Data models
│   ├── Services/           # API services, sync, auth
│   │   ├── Api/            # Refit API interfaces
│   │   ├── Auth/           # Authentication service
│   │   ├── Sync/           # Offline sync service
│   │   └── Location/       # Geofencing and location
│   ├── RealmModels/        # Realm database models
│   ├── Converters/         # XAML value converters
│   ├── Resources/          # Images, fonts, styles
│   ├── Platforms/
│   │   ├── Android/        # Android-specific code
│   │   └── iOS/            # iOS-specific code
│   ├── MauiProgram.cs      # App startup and DI
│   └── App.xaml            # App resources
├── MyEvaluations.Tests/    # Unit tests
├── .github/workflows/      # CI/CD pipelines
└── MyEvaluations.sln       # Solution file
```

## Common Development Tasks

### Restore NuGet Packages

```bash
dotnet restore
```

### Build from Command Line

```bash
# Android
dotnet build -f net9.0-android

# iOS (Mac only)
dotnet build -f net9.0-ios
```

### Run Unit Tests

```bash
dotnet test MyEvaluations.Tests/
```

## Firebase Push Notifications Setup

For push notifications to work in local development:

1. Obtain the `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) from the team lead
2. Place them in the appropriate platform directories:
   - Android: `Platforms/Android/google-services.json`
   - iOS: `Platforms/iOS/GoogleService-Info.plist`

These files are not committed to source control.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| MAUI workload not found | Run `dotnet workload install maui` |
| Android emulator won't start | Enable Hyper-V (Windows) or HAXM; check BIOS virtualization |
| iOS build fails on Windows | Ensure a Mac build host is connected and paired |
| NuGet restore fails | Clear NuGet cache: `dotnet nuget locals all --clear` |
| App crashes on launch | Check API base URL and VPN connection |
| Realm migration error | Increment the Realm schema version in `MauiProgram.cs` |
| Push notifications not received | Verify Firebase config files are in place |

## Next Steps

- Read the [MAUI App Overview](/docs/maui-app/overview) for architecture details
- Review the [Feature Matrix](/docs/cross-cutting/feature-matrix) to see which features are available on mobile
- Check the [Node.js Backend Overview](/docs/nodejs-backend/overview) for the API the app primarily communicates with
