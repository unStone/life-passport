package dev.passport.life_controller

import io.flutter.embedding.android.FlutterActivity
import android.os.Build
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(engine: FlutterEngine) {
        super.configureFlutterEngine(engine)
        MethodChannel(engine.dartExecutor.binaryMessenger, "life/platform").setMethodCallHandler { call, result ->
            if (call.method == "androidSdk") result.success(Build.VERSION.SDK_INT)
            else result.notImplemented()
        }
    }
}
