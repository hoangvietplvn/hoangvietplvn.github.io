plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "vn.hoangvietplvn.danbai"
    compileSdk = 35

    defaultConfig {
        applicationId = "vn.hoangvietplvn.danbai"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.12.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.activity:activity:1.9.3")
}

// Mã giao diện dùng chung với tiện ích Chrome (thư mục tools/dan-bai-cms) được sao chép vào APK khi build.
val syncWebAssets by tasks.registering(Copy::class) {
    from(rootDir.resolve("../tools/dan-bai-cms")) {
        include("app.html", "app.css", "app.js", "extract.js", "cms-fill.js", "cms-pick.js", "shim.js", "lib/**")
    }
    into(layout.projectDirectory.dir("src/main/assets/app"))
}

tasks.named("preBuild") {
    dependsOn(syncWebAssets)
}
