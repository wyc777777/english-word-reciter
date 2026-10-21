// ==================== 主目录启动器 ====================
// 编译成一个很小的 exe（无控制台窗口），双击即启动打包好的桌面应用。
// 编译：见 tools/build-launcher.js（用 Windows 自带的 csc.exe）

using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

class Launcher
{
    [STAThread]
    static void Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string exe = FindApp(root);

        if (exe == null)
        {
            MessageBox.Show(
                "没有找到桌面应用。\n\n请先在项目目录里执行：\n    npm run dist\n\n生成后即可双击本启动器使用。",
                "英语猜词背诵器",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        try
        {
            var psi = new ProcessStartInfo(exe);
            psi.WorkingDirectory = Path.GetDirectoryName(exe);
            psi.UseShellExecute = false;
            // 让应用沿用本项目里的 data/（进度、AI 配置、词库都在这里）
            psi.EnvironmentVariables["RECITER_DATA_DIR"] = Path.Combine(root, "data");
            Process.Start(psi);
        }
        catch (Exception e)
        {
            MessageBox.Show("启动失败：" + e.Message, "英语猜词背诵器",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    // 在 dist-app 下找桌面应用主程序
    static string FindApp(string root)
    {
        string direct = Path.Combine(root, @"dist-app\英语猜词背诵器-win32-x64\英语猜词背诵器.exe");
        if (File.Exists(direct)) return direct;

        string distApp = Path.Combine(root, "dist-app");
        if (Directory.Exists(distApp))
        {
            foreach (string dir in Directory.GetDirectories(distApp))
            {
                string p = Path.Combine(dir, "英语猜词背诵器.exe");
                if (File.Exists(p)) return p;
            }
        }
        return null;
    }
}
