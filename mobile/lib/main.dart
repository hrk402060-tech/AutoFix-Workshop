import 'package:flutter/material.dart';
import 'services/api_client.dart';

const navy = Color(0xff061a31);
const panel = Color(0xff0d2945);
const blue = Color(0xff078dec);
const muted = Color(0xff8ca8bd);

void main() => runApp(const AutoFixApp());

class AutoFixApp extends StatelessWidget {
  const AutoFixApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '车匠云修',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: navy,
        colorScheme: ColorScheme.fromSeed(seedColor: blue, brightness: Brightness.dark),
        useMaterial3: true,
        inputDecorationTheme: const InputDecorationTheme(
          filled: true,
          fillColor: Color(0xfff7fbff),
          labelStyle: TextStyle(color: Color(0xff6f8496)),
          border: OutlineInputBorder(borderSide: BorderSide.none),
        ),
      ),
      home: const LoginPage(),
    );
  }
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final username = TextEditingController(text: 'admin');
  final password = TextEditingController(text: 'Admin@123');
  final api = ApiClient();
  bool loading = false;
  String? error;

  Future<void> login() async {
    setState(() { loading = true; error = null; });
    try {
      await api.login(username.text.trim(), password.text);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => MobileShell(api: api)));
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(child: Container(decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xff061a31), Color(0xff0b4b76)])))),
          Positioned(right: -90, bottom: 70, child: Icon(Icons.directions_car_filled, size: 300, color: Colors.white.withOpacity(.05))),
          Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 430),
                child: Card(
                  color: Colors.white,
                  child: Padding(
                    padding: const EdgeInsets.all(26),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Brand(light: true),
                        const SizedBox(height: 30),
                        const Text('员工端登录', style: TextStyle(color: navy, fontSize: 24, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 6),
                        const Text('登录后查看维修任务和车辆进度', style: TextStyle(color: Color(0xff718596), fontSize: 12)),
                        const SizedBox(height: 24),
                        TextField(controller: username, style: const TextStyle(color: navy), decoration: const InputDecoration(labelText: '用户名')),
                        const SizedBox(height: 12),
                        TextField(controller: password, obscureText: true, style: const TextStyle(color: navy), decoration: const InputDecoration(labelText: '密码')),
                        if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: const TextStyle(color: Colors.red))),
                        const SizedBox(height: 20),
                        FilledButton(onPressed: loading ? null : login, child: Text(loading ? '登录中...' : '登录工作台')),
                        const SizedBox(height: 14),
                        const Text('默认账号：admin / Admin@123', textAlign: TextAlign.center, style: TextStyle(color: Color(0xff95a6b2), fontSize: 10)),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class MobileShell extends StatefulWidget {
  const MobileShell({required this.api, super.key});
  final ApiClient api;
  @override
  State<MobileShell> createState() => _MobileShellState();
}

class _MobileShellState extends State<MobileShell> {
  int tab = 0;
  List<dynamic> orders = [];

  @override
  void initState() {
    super.initState();
    loadOrders();
  }

  Future<void> loadOrders() async {
    final data = await widget.api.get('/work-orders') as List<dynamic>;
    if (mounted) setState(() => orders = data);
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      WorkbenchPage(orders: orders, onRefresh: loadOrders, onOpenIntake: () => showIntake(context)),
      MyWorkPage(orders: orders),
      const VehiclePage(),
      const ProfilePage(),
    ];
    return Scaffold(
      body: SafeArea(child: pages[tab]),
      bottomNavigationBar: NavigationBar(
        backgroundColor: const Color(0xff071b31),
        indicatorColor: const Color(0xff0b75bd),
        selectedIndex: tab,
        onDestinationSelected: (index) => setState(() => tab = index),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: '工作台'),
          NavigationDestination(icon: Icon(Icons.assignment_outlined), selectedIcon: Icon(Icons.assignment), label: '我的工作'),
          NavigationDestination(icon: Icon(Icons.directions_car_outlined), selectedIcon: Icon(Icons.directions_car), label: '车辆'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: '我的'),
        ],
      ),
    );
  }

  void showIntake(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: panel,
      isScrollControlled: true,
      builder: (_) => const IntakeSheet(),
    );
  }
}

class WorkbenchPage extends StatelessWidget {
  const WorkbenchPage({required this.orders, required this.onRefresh, required this.onOpenIntake, super.key});
  final List<dynamic> orders;
  final Future<void> Function() onRefresh;
  final VoidCallback onOpenIntake;

  @override
  Widget build(BuildContext context) {
    final repairing = orders.where((order) => order['status'] == 'REPAIRING').length;
    final pending = orders.where((order) => order['status'] == 'PENDING').length;
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 26),
        children: [
          const Brand(),
          const SizedBox(height: 22),
          const Text('你好，今天也辛苦了', style: TextStyle(color: muted, fontSize: 12)),
          const SizedBox(height: 4),
          const Text('维修工作台', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), gradient: const LinearGradient(colors: [Color(0xff0b5a91), Color(0xff0b2947)])),
            child: Row(
              children: [
                const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('车辆接待与维修协作', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)), SizedBox(height: 6), Text('扫码进入工单，上传维修过程照片', style: TextStyle(color: Color(0xffa6d3ec), fontSize: 11))])),
                Icon(Icons.directions_car_filled, size: 78, color: Colors.white.withOpacity(.26)),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Row(children: [StatCard(label: '待处理', value: '$pending', icon: Icons.assignment_late_outlined), const SizedBox(width: 10), StatCard(label: '维修中', value: '$repairing', icon: Icons.build_outlined), const SizedBox(width: 10), StatCard(label: '已完成', value: '${orders.where((o) => o['status'] == 'COMPLETED').length}', icon: Icons.check_circle_outline)]),
          const SizedBox(height: 15),
          Row(children: [Expanded(child: ActionTile(icon: Icons.qr_code_scanner, title: '扫码 / 工单入口', onTap: () {})), const SizedBox(width: 10), Expanded(child: ActionTile(icon: Icons.add_a_photo_outlined, title: '接车建单', onTap: onOpenIntake))]),
          const SizedBox(height: 20),
          SectionTitle(title: '我的维修任务', action: '查看全部'),
          const SizedBox(height: 8),
          if (orders.isEmpty) const EmptyTask() else ...orders.take(3).map((order) => TaskCard(order: order)),
        ],
      ),
    );
  }
}

class MyWorkPage extends StatelessWidget {
  const MyWorkPage({required this.orders, super.key});
  final List<dynamic> orders;
  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.all(16), children: [
      const SizedBox(height: 5),
      const Text('我的工作', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700)),
      const SizedBox(height: 5),
      const Text('个人任务、维修照片和完成记录', style: TextStyle(color: muted, fontSize: 12)),
      const SizedBox(height: 18),
      Row(children: [Expanded(child: ActionTile(icon: Icons.qr_code_2, title: '扫码进入工单', onTap: () {})), const SizedBox(width: 10), Expanded(child: ActionTile(icon: Icons.bar_chart, title: '个人统计', onTap: () {}) )]),
      const SizedBox(height: 20),
      SectionTitle(title: '进行中的工单', action: '${orders.length} 条'),
      const SizedBox(height: 8),
      ...orders.map((order) => TaskCard(order: order)),
    ]);
  }
}

class VehiclePage extends StatelessWidget {
  const VehiclePage({super.key});
  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(16), children: const [Text('车辆档案', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700)), SizedBox(height: 6), Text('车牌、VIN 和车辆照片', style: TextStyle(color: muted, fontSize: 12)), SizedBox(height: 25), EmptyTask(label: '车辆查询和拍照入口已预留')]);
}

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});
  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(16), children: const [Text('我的', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700)), SizedBox(height: 18), Card(child: ListTile(leading: CircleAvatar(backgroundColor: blue, child: Text('管')), title: Text('系统管理员'), subtitle: Text('老板 · 车匠云修'))), SizedBox(height: 16), Card(child: Column(children: [ListTile(leading: Icon(Icons.photo_camera_outlined), title: Text('维修照片设置'), trailing: Icon(Icons.chevron_right)), ListTile(leading: Icon(Icons.lock_outline), title: Text('账号与安全'), trailing: Icon(Icons.chevron_right))]))]);
}

class IntakeSheet extends StatelessWidget {
  const IntakeSheet({super.key});
  @override
  Widget build(BuildContext context) => Padding(padding: EdgeInsets.only(left: 18, right: 18, top: 18, bottom: MediaQuery.of(context).viewInsets.bottom + 25), child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [Row(children: [const Expanded(child: Text('接车建单', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)), IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close))]), const SizedBox(height: 8), const Text('快速建立本次进厂工单', style: TextStyle(color: muted, fontSize: 12)), const SizedBox(height: 18), const TextField(decoration: InputDecoration(labelText: '车牌号 / VIN')), const SizedBox(height: 12), const TextField(decoration: InputDecoration(labelText: '客户维修需求')), const SizedBox(height: 17), SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.camera_alt_outlined), label: const Text('拍摄车辆照片并创建')))]));
}

class TaskCard extends StatelessWidget {
  const TaskCard({required this.order, super.key});
  final dynamic order;
  @override
  Widget build(BuildContext context) => Card(color: panel, child: Padding(padding: const EdgeInsets.all(13), child: Row(children: [Container(width: 53, height: 53, decoration: BoxDecoration(borderRadius: BorderRadius.circular(9), color: const Color(0xff123b5d)), child: const Icon(Icons.directions_car_filled, color: Color(0xff77cfff), size: 29)), const SizedBox(width: 11), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(order['orderNo']?.toString() ?? '维修工单', style: const TextStyle(fontWeight: FontWeight.w700)), const SizedBox(height: 4), Text(order['customerRequest']?.toString() ?? '待补充维修需求', style: const TextStyle(color: muted, fontSize: 11), maxLines: 1, overflow: TextOverflow.ellipsis), const SizedBox(height: 7), Text('${order['status'] == 'COMPLETED' ? '已完成' : '维修中'} · ${order['items']?.length ?? 0} 个维修项目', style: const TextStyle(color: Color(0xff5fc3ff), fontSize: 10))])), const Icon(Icons.chevron_right, color: muted)])));
}

class StatCard extends StatelessWidget {
  const StatCard({required this.label, required this.value, required this.icon, super.key});
  final String label;
  final String value;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Expanded(child: Container(padding: const EdgeInsets.all(11), decoration: BoxDecoration(color: panel, borderRadius: BorderRadius.circular(9)), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Icon(icon, size: 18, color: const Color(0xff5bc2ff)), const SizedBox(height: 8), Text(value, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w700)), Text(label, style: const TextStyle(color: muted, fontSize: 10))])));
}

class ActionTile extends StatelessWidget {
  const ActionTile({required this.icon, required this.title, required this.onTap, super.key});
  final IconData icon;
  final String title;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => InkWell(onTap: onTap, borderRadius: BorderRadius.circular(10), child: Container(padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 11), decoration: BoxDecoration(color: panel, borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xff1c4260))), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Icon(icon, color: const Color(0xff42b9ff)), const SizedBox(height: 12), Text(title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600))])));
}

class SectionTitle extends StatelessWidget {
  const SectionTitle({required this.title, required this.action, super.key});
  final String title;
  final String action;
  @override
  Widget build(BuildContext context) => Row(children: [Expanded(child: Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700))), Text(action, style: const TextStyle(color: Color(0xff56c3ff), fontSize: 11))]);
}

class EmptyTask extends StatelessWidget {
  const EmptyTask({this.label = '暂无维修任务', super.key});
  final String label;
  @override
  Widget build(BuildContext context) => Card(color: panel, child: Padding(padding: const EdgeInsets.all(24), child: Center(child: Text(label, style: const TextStyle(color: muted, fontSize: 12))));
}

class Brand extends StatelessWidget {
  const Brand({this.light = false, super.key});
  final bool light;
  @override
  Widget build(BuildContext context) => Row(children: [Container(width: 35, height: 35, decoration: BoxDecoration(color: light ? blue : const Color(0xff0c5f96), borderRadius: BorderRadius.circular(9)), child: const Icon(Icons.build, size: 19)), const SizedBox(width: 10), Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('车匠云修', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white)), Text('AutoFix Workshop', style: TextStyle(fontSize: 9, color: muted))])]);
}
