import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'seed_home.dart';

void main() {
  LicenseRegistry.addLicense(() async* {
    final notice = await rootBundle.loadString('assets/fonts/NOTICE.txt');
    final license = await rootBundle.loadString('assets/fonts/OFL.txt');
    yield LicenseEntryWithLineBreaks(['Noto Sans SC'], '$notice\n$license');
  });
  runApp(const LifeApp());
}

class LifeApp extends StatelessWidget {
  const LifeApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: '生命种子',
    locale: const Locale('zh', 'CN'),
    supportedLocales: const [Locale('zh', 'CN')],
    localizationsDelegates: const [
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    theme: ThemeData(
      fontFamily: 'LifeUI',
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xff285e4b),
        brightness: Brightness.light,
      ),
      scaffoldBackgroundColor: const Color(0xfff4f5ec),
    ),
    home: const SeedHome(),
  );
}
